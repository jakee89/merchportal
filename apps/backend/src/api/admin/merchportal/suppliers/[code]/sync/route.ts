import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { SyncKind } from "../../../../../../modules/merchportal/adapters"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { queueSupplierSync } from "../../../../../../modules/merchportal/sync"
import { requireStaff } from "../../../auth"

type Body = { kind?: SyncKind; dry_run?: boolean }

export async function POST(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) {
  await requireStaff(req)
  const kind = req.body.kind
  if (!kind || !["catalog", "price", "stock"].includes(kind)) {
    res.status(400).json({ message: "Choose catalog, price, or stock" })
    return
  }
  const code = req.params.code as "stricker" | "midocean"
  if (!["stricker", "midocean"].includes(code)) {
    res.status(400).json({ message: "Choose a supported supplier" })
    return
  }
  if (req.body.dry_run && kind !== "catalog") {
    res.status(400).json({ message: "A preview is available for catalog updates only" })
    return
  }
  const queued = await queueSupplierSync(req.scope, code, kind, "manual", { dryRun: Boolean(req.body.dry_run) })
  if (queued.already_running) {
    res.status(202).json({ message: `${kind} update is already queued or running`, job: queued })
    return
  }
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS) as { emit: (event: { name: string; data: Record<string, unknown> }) => Promise<void> }
    await eventBus.emit({
      name: "merchportal.supplier_sync.requested",
      data: {
        supplier_code: code,
        kind,
        trigger: "manual",
        dry_run: Boolean(req.body.dry_run),
        job_id: queued.id,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not queue supplier update"
    const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
    await service.updateImportJobs({
      id: queued.id,
      status: "failed",
      phase: "failed",
      current_message: message,
      error_count: 1,
      error_message: message,
      completed_at: new Date(),
    })
    throw error
  }
  res.status(202).json({ message: req.body.dry_run ? "Catalog preview queued" : `${kind} update queued`, job: queued })
}
