import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function portalUsageRetention(container: MedusaContainer) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const before = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10)
  await knex("merchportal_usage_daily").where("day", "<", before).delete()
}

export const config = { name: "portal-usage-retention", schedule: "45 3 * * *" }
