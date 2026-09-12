import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ImportCancelledError, runSupplierSync, stopIfImportCancelled, updateImportJobActivity } from "../modules/merchportal/sync"
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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.length) return message
    try {
      return JSON.stringify(error).slice(0, 2_000)
    } catch {}
  }
  return "Supplier catalog update failed"
}

const syncSupplierStep = createStep("sync-supplier", async (input: Input, { container }) => {
  const job = await runSupplierSync(container, input.supplier_code, input.kind, input.trigger, {
    dryRun: input.dry_run,
    jobId: input.job_id,
  })
  if (job.already_running || job.status === "cancelled") {
    return new StepResponse({
      job,
      catalog: { updated_products: 0, updated_prices: 0, updated_stock: 0 },
    })
  }
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  try {
    let publication: Awaited<ReturnType<typeof autoPublishSupplierCatalog>> | undefined
    const livePublicationErrors: string[] = []
    if (input.kind === "catalog" && !input.dry_run) {
      await updateImportJobActivity(service, job.id, {
        phase: "publishing",
        current_message: "Publishing products to the Malta catalog",
        progress_percent: 60,
        processed: 0,
      })
      publication = await autoPublishSupplierCatalog(container, input.supplier_code, async (published, total) => {
        await stopIfImportCancelled(service, job.id)
        await updateImportJobActivity(service, job.id, {
          phase: "publishing",
          total_records: total,
          processed: published,
          progress_percent: 60 + Math.floor((published / Math.max(1, total)) * 30),
          current_message: total ? `Publishing parent products (${published.toLocaleString()} of ${total.toLocaleString()})` : "All parent products are already published",
        })
      }, async (message) => {
        livePublicationErrors.push(message)
        if (livePublicationErrors.length <= 5 || livePublicationErrors.length % 25 === 0) {
          await updateImportJobActivity(service, job.id, {
            current_message: `Publishing continued with ${livePublicationErrors.length.toLocaleString()} product errors`,
            error_count: livePublicationErrors.length,
            log: { publication_errors: livePublicationErrors },
          })
        }
      })
    }
    const catalog = input.dry_run
      ? { updated_products: 0, updated_prices: 0, updated_stock: 0 }
      : await (async () => {
        await stopIfImportCancelled(service, job.id)
        await updateImportJobActivity(service, job.id, {
          phase: "refreshing",
          current_message: "Refreshing client prices, stock and search filters",
          progress_percent: 92,
        })
        return refreshPublishedSupplierProducts(container, input.supplier_code, publication?.normalized, async (percent, message) => {
          await stopIfImportCancelled(service, job.id)
          await updateImportJobActivity(service, job.id, {
            phase: "refreshing",
            current_message: message,
            progress_percent: percent,
          })
        })
      })()
    await updateImportJobActivity(service, job.id, {
      status: "completed",
      phase: "completed",
      current_message: input.dry_run ? "Preview completed — catalog was not published" : "Update completed",
      progress_percent: 100,
      completed_at: new Date(),
      error_count: publication?.errors.length || 0,
      error_message: publication?.errors.length ? `${publication.errors.length} supplier products could not be published. Download the full log for exact validation details.` : null,
      log: {
        message: "Supplier update completed",
        dry_run: Boolean(input.dry_run),
        published_count: publication?.created || 0,
        catalog_total: publication?.total || catalog.updated_products,
        publication_errors: publication?.errors || [],
      },
    })
    return new StepResponse({
      job: await service.retrieveImportJob(job.id),
      catalog,
    })
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      return new StepResponse({
        job: await service.retrieveImportJob(job.id),
        catalog: { updated_products: 0, updated_prices: 0, updated_stock: 0 },
      })
    }
    const message = errorMessage(error)
    await updateImportJobActivity(service, job.id, {
      status: "failed",
      phase: "failed",
      current_message: message,
      progress_percent: 100,
      completed_at: new Date(),
      error_count: 1,
      error_message: message,
      log: {
        failure: {
          at: new Date().toISOString(),
          phase: "publishing",
          type: error instanceof Error ? error.name : "Error",
          message,
        },
      },
    })
    throw error
  }
})

export const supplierSyncWorkflow = createWorkflow("supplier-sync", (input: Input) => {
  return new WorkflowResponse(syncSupplierStep(input))
})
