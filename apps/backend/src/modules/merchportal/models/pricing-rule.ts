import { model } from "@medusajs/framework/utils"

const PricingRule = model
  .define("merchportal_pricing_rule", {
    id: model.id().primaryKey(),
    scope_key: model.text(),
    organization_id: model.text().nullable(),
    markup_percentage: model.number().default(30),
    status: model.enum(["active", "disabled"]).default("active"),
  })
  .indexes([
    { on: ["scope_key"], unique: true },
    { on: ["organization_id"] },
  ])

export default PricingRule
