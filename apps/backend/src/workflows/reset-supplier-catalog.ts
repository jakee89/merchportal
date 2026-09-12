import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

function batches<T>(items: T[], size = 250) {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size))
  }
  return output
}

async function listAll(service: any, method: string) {
  const records: any[] = []
  const take = 5000
  for (let skip = 0; ; skip += take) {
    const batch = await service[method]({}, { take, skip })
    records.push(...batch)
    if (batch.length < take) return records
  }
}

const resetSupplierCatalogStep = createStep(
  "reset-supplier-catalog",
  async (_, { container }) => {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    const productService = container.resolve(Modules.PRODUCT) as any
    const inventoryService = container.resolve(Modules.INVENTORY) as any
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const activeJobs = await service.listImportJobs(
      { status: ["queued", "running", "cancelling"] },
      { take: 1 }
    )
    if (activeJobs.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Stop the active supplier update before resetting the catalog"
      )
    }

    const [sources, rawRecords, configurations, suppliers] = await Promise.all([
      listAll(service, "listPublishedProductSources"),
      listAll(service, "listRawSupplierRecords"),
      listAll(service, "listProductConfigurations"),
      service.listSuppliers({}),
    ])
    const productIds = [...new Set(sources.map((source) => source.product_id).filter(Boolean))]
    const supplierSkus = [...new Set([
      ...rawRecords.map((record) => record.sku).filter(Boolean),
      ...sources.flatMap((source) => Object.keys(source.cost_by_sku || {})),
    ])]

    for (const batch of batches(productIds, 100)) {
      await productService.deleteProducts(batch)
    }

    const targetedInventoryIds: string[] = []
    for (const skuBatch of batches(supplierSkus, 500)) {
      const { data } = await query.graph({
        entity: "inventory_item",
        fields: ["id"],
        filters: { sku: skuBatch },
        pagination: { take: 5000 },
      })
      targetedInventoryIds.push(...data.map((item: any) => item.id))
    }
    for (const batch of batches([...new Set(targetedInventoryIds)])) {
      await inventoryService.deleteInventoryItems(batch)
    }

    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "variants.id"],
      pagination: { take: 50000 },
    })
    const orphanInventoryIds = inventoryItems
      .filter((item: any) => !item.variants?.length)
      .map((item: any) => item.id)
    for (const batch of batches(orphanInventoryIds)) {
      await inventoryService.deleteInventoryItems(batch)
    }
    for (const batch of batches(configurations.map((record) => record.id))) {
      await service.deleteProductConfigurations(batch)
    }
    for (const batch of batches(sources.map((source) => source.id))) {
      await service.deletePublishedProductSources(batch)
    }
    for (const batch of batches(rawRecords.map((record) => record.id))) {
      await service.deleteRawSupplierRecords(batch)
    }
    for (const supplier of suppliers) {
      await service.updateSuppliers({
        id: supplier.id,
        product_sync_at: null,
        price_sync_at: null,
        stock_sync_at: null,
        last_error: null,
      })
    }

    return new StepResponse({
      deleted_products: productIds.length,
      deleted_supplier_records: rawRecords.length,
      deleted_configurations: configurations.length,
      deleted_inventory_items: targetedInventoryIds.length + orphanInventoryIds.length,
    })
  }
)

export const resetSupplierCatalogWorkflow = createWorkflow(
  "reset-supplier-catalog",
  () => new WorkflowResponse(resetSupplierCatalogStep())
)
