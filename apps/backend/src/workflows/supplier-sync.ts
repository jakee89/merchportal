import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ImportCancelledError, runSupplierSync, stopIfImportCancelled, updateImportJobActivity } from "../modules/merchportal/sync"
import type { SyncKind } from "../modules/merchportal/adapters"
import { autoPublishSupplierCatalog, refreshPublishedSupplierProducts } from "./publish-normalized-products"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { opaqueSourceKey, supplierMasterReference } from "../modules/merchportal/normalization"

type Input = {
  supplier_code: "stricker" | "midocean" | "aodaci"
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
    const changedRecords = ((job as any).changed_records || []) as Array<{ type: string; externalId: string; sku?: string; payload: Record<string, any> }>
    const sharedDecorationChanged = Boolean((job as any).shared_decoration_changed)
    const suppliers = await service.listSuppliers({ code: input.supplier_code }, { take: 1 })
    const supplierId = suppliers[0]?.id
    const recentJobs = supplierId ? await service.listImportJobs({ supplier_id: supplierId, kind: input.kind }, { take: 5, order: { created_at: "DESC" } }) : []
    const previousJob = recentJobs.find((item: { id: string }) => item.id !== job.id)
    const retryAfterFailure = previousJob?.status === "failed" || previousJob?.status === "cancelled"
    const affectedKeys = new Set<string>()
    const changedSkus = new Set(changedRecords.filter((record) => record.type === "stock" || record.type === "price").map((record) => record.sku).filter((sku): sku is string => Boolean(sku)))
    for (const record of changedRecords) {
      const master = supplierMasterReference(input.supplier_code, record.payload, record.externalId)
      if (supplierId && master) affectedKeys.add(opaqueSourceKey(supplierId, master))
    }
    if (changedSkus.size && supplierId) {
      const sources = await service.listPublishedProductSources({ supplier_id: supplierId }, { take: 50000 })
      for (const source of sources) {
        if ((source.catalog_document?.variants || []).some((variant: { sku?: string }) => variant.sku && changedSkus.has(variant.sku))) affectedKeys.add(source.source_key)
      }
    }
    const needsFullRefresh = retryAfterFailure || (input.kind === "catalog" && sharedDecorationChanged)
    const sourceKeys = needsFullRefresh ? undefined : [...affectedKeys]
    const hasChanges = changedRecords.length > 0 || sharedDecorationChanged || retryAfterFailure
    let publication: Awaited<ReturnType<typeof autoPublishSupplierCatalog>> | undefined
    const livePublicationErrors: string[] = []
    if (input.kind === "catalog" && !input.dry_run && hasChanges) {
      await updateImportJobActivity(service, job.id, {
        phase: "normalizing",
        current_message: "Preparing products for the Malta catalog",
        progress_percent: 60,
        processed: 0,
      })
      publication = await autoPublishSupplierCatalog(container, input.supplier_code, async (published, total) => {
        await stopIfImportCancelled(service, job.id)
        await updateImportJobActivity(service, job.id, {
          phase: "publishing",
          total_records: total,
          processed: published,
          progress_percent: 68 + Math.floor((published / Math.max(1, total)) * 22),
          current_message: total ? `Publishing parent products (${published.toLocaleString()} of ${total.toLocaleString()})` : "All parent products are already published",
        })
      }, async (message) => {
        livePublicationErrors.push(message)
        if (livePublicationErrors.length <= 10 || livePublicationErrors.length % 25 === 0) {
          await updateImportJobActivity(service, job.id, {
            current_message: `Publishing continued with ${livePublicationErrors.length.toLocaleString()} product errors`,
            error_count: livePublicationErrors.length,
            log: { publication_errors: livePublicationErrors },
          })
        }
      }, async (completed, total) => {
        await stopIfImportCancelled(service, job.id)
        await updateImportJobActivity(service, job.id, {
          phase: "normalizing",
          total_records: total,
          processed: completed,
          progress_percent: 60 + Math.floor((completed / Math.max(1, total)) * 8),
          current_message: `Preparing parent products (${completed.toLocaleString()} of ${total.toLocaleString()})`,
        })
      }, sourceKeys)
    }
    const catalog = input.dry_run || !hasChanges || (sourceKeys?.length === 0)
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
        }, () => stopIfImportCancelled(service, job.id).then(() => undefined), sourceKeys, input.kind)
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
        catalog_refreshed: !input.dry_run && hasChanges && (sourceKeys === undefined || sourceKeys.length > 0),
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
    const failedJob = await service.retrieveImportJob(job.id)
    await updateImportJobActivity(service, job.id, {
      status: "failed",
      phase: "failed",
      current_message: message,
      progress_percent: 100,
      completed_at: new Date(),
      error_count: Math.max(1, Number(failedJob.error_count) || 0),
      error_message: message,
      log: {
        failure: {
          at: new Date().toISOString(),
          phase: failedJob.phase || "refreshing",
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
