import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { runSupplierSync } from "../modules/merchportal/sync"
import type { SyncKind } from "../modules/merchportal/adapters"
import { autoPublishSupplierCatalog, refreshPublishedSupplierProducts } from "./publish-normalized-products"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

type Input = {
  supplier_code: "stricker" | "midocean"
  kind: SyncKind
  trigger: "manual" | "scheduled"
  dry_run?: boolean
  job_id?: string
}

const syncSupplierStep = createStep("sync-supplier", async (input: Input, { container }) => {
  const job = await runSupplierSync(container, input.supplier_code, input.kind, input.trigger, {
    dryRun: input.dry_run,
    jobId: input.job_id,
  })
  if (job.already_running) {
    return new StepResponse({
      job,
      catalog: { updated_products: 0, updated_prices: 0, updated_stock: 0 },
    })
  }
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  try {
    let publication: Awaited<ReturnType<typeof autoPublishSupplierCatalog>> | undefined
    if (input.kind === "catalog" && !input.dry_run) {
      await service.updateImportJobs({
        id: job.id,
        phase: "publishing",
        current_message: "Publishing products to the Malta catalog",
        progress_percent: 60,
        processed: 0,
      })
      publication = await autoPublishSupplierCatalog(container, input.supplier_code, async (published, total) => {
        await service.updateImportJobs({
          id: job.id,
          phase: "publishing",
          total_records: total,
          processed: published,
          progress_percent: 60 + Math.floor((published / Math.max(1, total)) * 30),
          current_message: total ? `Publishing parent products (${published.toLocaleString()} of ${total.toLocaleString()})` : "All parent products are already published",
        })
      })
    }
    const catalog = input.dry_run
      ? { updated_products: 0, updated_prices: 0, updated_stock: 0 }
      : await (async () => {
        await service.updateImportJobs({
          id: job.id,
          phase: "refreshing",
          current_message: "Refreshing client prices, stock and search filters",
          progress_percent: 92,
        })
        return refreshPublishedSupplierProducts(container, input.supplier_code, publication?.normalized, async (percent, message) => {
          await service.updateImportJobs({
            id: job.id,
            phase: "refreshing",
            current_message: message,
            progress_percent: percent,
          })
        })
      })()
    await service.updateImportJobs({
      id: job.id,
      status: "completed",
      phase: "completed",
      current_message: input.dry_run ? "Preview completed — catalog was not published" : "Update completed",
      progress_percent: 100,
      completed_at: new Date(),
      log: {
        message: "Supplier update completed",
        dry_run: Boolean(input.dry_run),
        published_count: publication?.created || 0,
        catalog_total: publication?.total || catalog.updated_products,
      },
    })
    return new StepResponse({
      job: await service.retrieveImportJob(job.id),
      catalog,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier catalog update failed"
    await service.updateImportJobs({
      id: job.id,
      status: "failed",
      phase: "failed",
      current_message: message,
      progress_percent: 100,
      completed_at: new Date(),
      error_count: 1,
      error_message: message,
    })
    throw error
  }
})

export const supplierSyncWorkflow = createWorkflow("supplier-sync", (input: Input) => {
  return new WorkflowResponse(syncSupplierStep(input))
})
