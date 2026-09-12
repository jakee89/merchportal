import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../modules/merchportal"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const jobs = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
  const operations = jobs
    .filter((job: any) => job.status === "running" || job.status === "queued" || job.status === "cancelling")
    .map((job: any) => ({
      kind: job.kind,
      phase: job.phase || "starting",
      progress_percent: job.progress_percent || 0,
    }))

  res.json({
    status: "ok",
    operations,
  })
}
