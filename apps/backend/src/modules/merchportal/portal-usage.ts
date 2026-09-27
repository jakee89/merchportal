import { randomUUID } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

export type UsageIncrement = {
  logins?: number
  page_views?: number
  product_views?: number
  active_seconds?: number
}

function value(input: unknown, max: number) {
  const parsed = Number(input ?? 0)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid usage update")
  }
  return parsed
}

export function validateUsageIncrement(input: UsageIncrement) {
  const increment = {
    logins: value(input?.logins, 1),
    page_views: value(input?.page_views, 1),
    product_views: value(input?.product_views, 1),
    active_seconds: value(input?.active_seconds, 30),
  }
  if (!Object.values(increment).some(Boolean) || increment.product_views > increment.page_views) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid usage update")
  }
  return increment
}

export async function recordPortalUsage(container: any, actorId: string, input: UsageIncrement) {
  const increment = validateUsageIncrement(input)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const day = new Date().toISOString().slice(0, 10)
  await knex("merchportal_usage_daily").insert({
    id: `usage_${randomUUID()}`,
    actor_id: actorId,
    day,
    login_count: increment.logins,
    page_view_count: increment.page_views,
    product_view_count: increment.product_views,
    active_seconds: increment.active_seconds,
    last_seen_at: knex.fn.now(),
  }).onConflict(["actor_id", "day"]).merge({
    login_count: knex.raw('least(200, "merchportal_usage_daily"."login_count" + excluded."login_count")'),
    page_view_count: knex.raw('least(2000, "merchportal_usage_daily"."page_view_count" + excluded."page_view_count")'),
    product_view_count: knex.raw('least(1000, "merchportal_usage_daily"."product_view_count" + excluded."product_view_count")'),
    active_seconds: knex.raw('least(86400, "merchportal_usage_daily"."active_seconds" + excluded."active_seconds")'),
    last_seen_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  })
}

export async function portalUsageByActors(container: any, actorIds: string[]) {
  if (!actorIds.length) return new Map<string, any>()
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows = await knex("merchportal_usage_daily")
    .whereIn("actor_id", actorIds)
    .whereNull("deleted_at")
    .select("actor_id")
    .sum({ login_count: "login_count", page_view_count: "page_view_count", product_view_count: "product_view_count", active_seconds: "active_seconds" })
    .max({ last_seen_at: "last_seen_at" })
    .groupBy("actor_id")
  return new Map(rows.map((row: any) => [row.actor_id, {
    login_count: Number(row.login_count || 0),
    page_view_count: Number(row.page_view_count || 0),
    product_view_count: Number(row.product_view_count || 0),
    active_seconds: Number(row.active_seconds || 0),
    last_seen_at: row.last_seen_at || null,
  }]))
}

export async function portalUsageOverview(container: any, days = 30) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const [daily, clients, quotes] = await Promise.all([
    knex("merchportal_usage_daily").where("day", ">=", since).whereNull("deleted_at")
      .select("day")
      .sum({ login_count: "login_count", page_view_count: "page_view_count", product_view_count: "product_view_count", active_seconds: "active_seconds" })
      .countDistinct({ active_clients: "actor_id" }).groupBy("day").orderBy("day", "asc"),
    knex("merchportal_membership").where({ actor_type: "customer", status: "active" }).whereNull("deleted_at").count({ count: "id" }).first(),
    knex("merchportal_quote_request").where("submitted_at", ">=", `${since}T00:00:00Z`).whereNull("deleted_at").count({ count: "id" }).first(),
  ])
  const rows = daily.map((row: any) => ({ day: row.day, logins: Number(row.login_count || 0), page_views: Number(row.page_view_count || 0), product_views: Number(row.product_view_count || 0), active_seconds: Number(row.active_seconds || 0), active_clients: Number(row.active_clients || 0) }))
  const totals = rows.reduce((result: any, row: any) => ({
    logins: result.logins + row.logins,
    page_views: result.page_views + row.page_views,
    product_views: result.product_views + row.product_views,
    active_seconds: result.active_seconds + row.active_seconds,
  }), { logins: 0, page_views: 0, product_views: 0, active_seconds: 0 })
  const activeClients = await knex("merchportal_usage_daily").where("day", ">=", since).whereNull("deleted_at").countDistinct({ count: "actor_id" }).first()
  return { days, since, totals, active_clients: Number(activeClients?.count || 0), client_count: Number(clients?.count || 0), submitted_quotes: Number(quotes?.count || 0), daily: rows }
}

export async function clearPortalUsage(container: any, actorId: string) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  await knex("merchportal_usage_daily").where({ actor_id: actorId }).delete()
}
