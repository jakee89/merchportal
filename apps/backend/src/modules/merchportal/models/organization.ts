import { model } from "@medusajs/framework/utils"

const Organization = model
  .define("merchportal_organization", {
    id: model.id().primaryKey(),
    name: model.text(),
    slug: model.text(),
    join_code: model.text().nullable(),
    status: model.enum(["active", "disabled"]).default("active"),
    logo_url: model.text().nullable(),
    primary_color: model.text().default("#0b6ffb"),
    secondary_color: model.text().default("#0b2545"),
    billing_address: model.json().nullable(),
    shipping_address: model.json().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    { on: ["slug"], unique: true },
    { on: ["join_code"], unique: true },
  ])

export default Organization
