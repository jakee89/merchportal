import { model } from "@medusajs/framework/utils"

export default model
  .define("merchportal_shortlist_item", {
    id: model.id().primaryKey(),
    shortlist_id: model.text(),
    product_id: model.text(),
    sku: model.text(),
  })
  .indexes([{ on: ["shortlist_id", "product_id", "sku"], unique: true }])
