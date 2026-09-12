import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
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

    for (const batch of batches(productIds, 100)) {
      await productService.deleteProducts(batch)
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
    })
  }
)

export const resetSupplierCatalogWorkflow = createWorkflow(
  "reset-supplier-catalog-workflow",
  () => new WorkflowResponse(resetSupplierCatalogStep())
)
