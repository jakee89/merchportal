import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { updateImportJobActivity } from "../../../../../../modules/merchportal/sync"
import { requireStaff } from "../../../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const job = await service.retrieveImportJob(req.params.id)

  if (job.status === "queued") {
    await updateImportJobActivity(service, job.id, {
      status: "cancelled",
      phase: "cancelled",
      current_message: "Stopped by staff before it started",
      completed_at: new Date(),
    })
  } else if (job.status === "running") {
    await updateImportJobActivity(service, job.id, {
      status: "cancelling",
      phase: "cancelling",
      current_message: "Stop requested — finishing the current batch safely",
      cancel_requested_at: new Date(),
    })
  } else if (job.status !== "cancelling") {
    res.status(409).json({ message: "Only queued or running imports can be stopped" })
    return
  }

  res.json({ job: await service.retrieveImportJob(job.id) })
}
