import { model } from "@medusajs/framework/utils"

const Supplier = model
  .define("merchportal_supplier", {
    id: model.id().primaryKey(),
    code: model.text(),
    display_name: model.text(),
    status: model.enum(["active", "disabled"]).default("active"),
    credential_env_var: model.text(),
    product_sync_at: model.dateTime().nullable(),
    price_sync_at: model.dateTime().nullable(),
    stock_sync_at: model.dateTime().nullable(),
    last_error: model.text().nullable(),
    configuration: model.json().nullable(),
  })
  .indexes([{ on: ["code"], unique: true }])

export default Supplier
