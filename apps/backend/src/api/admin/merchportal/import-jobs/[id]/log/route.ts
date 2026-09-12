import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { requireStaff } from "../../../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const job = await service.retrieveImportJob(req.params.id)
  const errors = Array.isArray(job.log?.publication_errors) ? job.log.publication_errors : []
  const events = Array.isArray(job.log?.events) ? job.log.events : []
  const lines = [
    `Supplier import ${job.id}`,
    `Kind: ${job.kind}`,
    `Status: ${job.status}`,
    `Started: ${job.started_at || job.created_at}`,
    `Completed: ${job.completed_at || "not completed"}`,
    `Errors: ${job.error_count || errors.length}`,
    "",
    "PUBLISHING ERRORS",
    ...errors.map((error: string, index: number) => `${index + 1}. ${error}`),
    "",
    "ACTIVITY",
    ...events.map((event: any) => `${event.at} | ${event.phase} | ${event.message}`),
  ]
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="supplier-import-${job.id}.log"`)
  res.send(lines.join("\n"))
}
