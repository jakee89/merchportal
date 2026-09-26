import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { queueSupplierSync } from "../modules/merchportal/sync"

export default async function refreshAodaciCatalog({ container }: ExecArgs) {
  const queued = await queueSupplierSync(container, "aodaci", "catalog", "manual")
  if (queued.already_running) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Supplier update already active: ${queued.id}`)
  }
  try {
    const eventBus = container.resolve(Modules.EVENT_BUS) as { emit: (event: { name: string; data: Record<string, unknown> }) => Promise<void> }
    await eventBus.emit({
      name: "merchportal.supplier_sync.requested",
      data: { supplier_code: "aodaci", kind: "catalog", trigger: "manual", dry_run: false, job_id: queued.id },
    })
  } catch (error) {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    await service.updateImportJobs({ id: queued.id, status: "failed", phase: "failed", completed_at: new Date(), error_message: error instanceof Error ? error.message : "Could not queue catalog update" })
    throw error
  }
  console.log(`AODACi catalog update queued: ${queued.id}`)
}
