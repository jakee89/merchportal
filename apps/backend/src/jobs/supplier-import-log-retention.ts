import type { MedusaContainer } from "@medusajs/framework/types"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

const completedRetentionMs = 30 * 24 * 60 * 60 * 1000
const failedRetentionMs = 90 * 24 * 60 * 60 * 1000

export default async function supplierImportLogRetention(container: MedusaContainer) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const now = Date.now()
  const take = 250
  for (let skip = 0; ; skip += take) {
    const jobs = await service.listImportJobs({}, { take, skip, order: { created_at: "ASC" } })
    for (const job of jobs) {
      if (!job.completed_at || !["completed", "failed", "cancelled"].includes(job.status)) continue
      const retention = job.status === "completed" ? completedRetentionMs : failedRetentionMs
      if (now - new Date(job.completed_at).getTime() < retention) continue
      if (job.log == null && (job.status === "completed" || job.error_message == null)) continue
      await service.updateImportJobs({
        id: job.id,
        log: null,
        ...(job.status === "completed" ? {} : { error_message: null }),
      })
    }
    if (jobs.length < take) break
  }
}

export const config = { name: "supplier-import-log-retention", schedule: "30 3 * * *" }
