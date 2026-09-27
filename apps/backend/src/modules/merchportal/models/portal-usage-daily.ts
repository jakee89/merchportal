import { model } from "@medusajs/framework/utils"

const PortalUsageDaily = model.define("merchportal_usage_daily", {
  id: model.id().primaryKey(),
  actor_id: model.text(),
  day: model.text(),
  login_count: model.number().default(0),
  page_view_count: model.number().default(0),
  product_view_count: model.number().default(0),
  active_seconds: model.number().default(0),
  last_seen_at: model.dateTime().nullable(),
}).indexes([
  { on: ["actor_id", "day"], unique: true },
  { on: ["day"] },
])

export default PortalUsageDaily
