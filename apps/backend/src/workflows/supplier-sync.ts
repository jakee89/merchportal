import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { runSupplierSync } from "../modules/merchportal/sync"
import type { SyncKind } from "../modules/merchportal/adapters"
import { autoPublishSupplierCatalog, refreshPublishedSupplierProducts } from "./publish-normalized-products"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

type Input = {
  supplier_code: "stricker" | "midocean"
  kind: SyncKind
  trigger: "manual" | "scheduled"
}

const syncSupplierStep = createStep("sync-supplier", async (input: Input, { container }) => {
  const job = await runSupplierSync(container, input.supplier_code, input.kind, input.trigger)
  if (input.kind === "catalog") {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    await service.updateImportJobs({ id: job.id, status: "running", completed_at: null, log: { message: "Publishing normalized products" } })
    try {
      const publication = await autoPublishSupplierCatalog(container, input.supplier_code)
      await service.updateImportJobs({ id: job.id, status: "completed", completed_at: new Date(), log: { message: "Catalog imported and published", published_count: publication.created, catalog_total: publication.total } })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automatic catalog publishing failed"
      await service.updateImportJobs({ id: job.id, status: "failed", completed_at: new Date(), error_count: 1, error_message: message, log: { message: "Catalog import completed but publishing failed" } })
      throw error
    }
  }
  const catalog = await refreshPublishedSupplierProducts(container, input.supplier_code)
  return new StepResponse({ job, catalog })
})

export const supplierSyncWorkflow = createWorkflow("supplier-sync", (input: Input) => {
  return new WorkflowResponse(syncSupplierStep(input))
})
