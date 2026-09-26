import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { supplierCategory } from "../modules/merchportal/catalog-rules"

type ActionInput = {
  mapping_id?: string
  action?: "approve" | "ignore" | "change"
  category?: string
}

export async function ensureCategoryMappings(
  container: MedusaContainer,
  supplierCode?: "stricker" | "midocean" | "aodaci" | "makito"
) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const suppliers = await service.listSuppliers({})
  const selectedSuppliers = supplierCode
    ? suppliers.filter((supplier: any) => supplier.code === supplierCode)
    : suppliers
  const discovered = new Set<string>()
  for (const supplier of selectedSuppliers) {
    const records = await service.listRawSupplierRecords(
      { supplier_id: supplier.id, record_type: "product" },
      { take: 50000 }
    )
    const existing = await service.listCategoryMappings({ supplier_id: supplier.id })
    const known = new Set(
      existing.map((mapping: any) => mapping.supplier_category.toLowerCase())
    )
    for (const category of new Set<string>(
      records.map((record: any) => supplierCategory(record.payload))
    )) {
      discovered.add(category)
      if (known.has(category.toLowerCase())) continue
      await service.createCategoryMappings({
        supplier_id: supplier.id,
        supplier_category: category,
        suggested_category: category,
        confidence: 1,
        status: "pending",
      })
      known.add(category.toLowerCase())
    }
  }
  const { data: nativeCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    pagination: { take: 5000 },
  })
  const nativeNames = new Set(
    nativeCategories.map((category: any) => category.name.toLowerCase())
  )
  const missing = [...discovered].filter(
    (category) => !nativeNames.has(category.toLowerCase())
  )
  if (missing.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((name) => ({ name, is_active: true })),
      },
    })
  }
}

const manageCategoryMappingsStep = createStep(
  "manage-category-mappings",
  async (input: ActionInput, { container }) => {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    await ensureCategoryMappings(container)
    if (input.mapping_id && input.action) {
      const mappings = await service.listCategoryMappings(
        { id: input.mapping_id },
        { take: 1 }
      )
      if (!mappings.length) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Category mapping not found")
      }
      if (input.action === "change" && !input.category?.trim()) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Enter the replacement category"
        )
      }
      await service.updateCategoryMappings({
        id: input.mapping_id,
        status: input.action === "ignore" ? "ignored" : "approved",
        approved_category:
          input.action === "ignore"
            ? null
            : input.action === "change"
              ? input.category!.trim()
              : mappings[0].suggested_category,
      })
    }
    const [mappings, suppliers] = await Promise.all([
      service.listCategoryMappings({}, { order: { updated_at: "DESC" } }),
      service.listSuppliers({}),
    ])
    const supplierNames = new Map(
      suppliers.map((supplier: any) => [supplier.id, supplier.display_name])
    )
    return new StepResponse({
      mappings: mappings.map((mapping: any) => ({
        ...mapping,
        supplier_name: supplierNames.get(mapping.supplier_id) || "Supplier",
      })),
    })
  }
)

export const manageCategoryMappingsWorkflow = createWorkflow(
  "manage-category-mappings",
  (input: ActionInput) =>
    new WorkflowResponse(manageCategoryMappingsStep(input))
)
