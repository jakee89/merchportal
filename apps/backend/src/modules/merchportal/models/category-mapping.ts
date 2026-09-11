import { model } from "@medusajs/framework/utils"

const CategoryMapping = model
  .define("merchportal_category_mapping", {
    id: model.id().primaryKey(),
    supplier_id: model.text(),
    supplier_category: model.text(),
    suggested_category: model.text(),
    approved_category: model.text().nullable(),
    confidence: model.number().default(0),
    status: model.enum(["pending", "approved", "ignored"]).default("pending"),
  })
  .indexes([
    { on: ["supplier_id", "supplier_category"], unique: true },
    { on: ["status"] },
  ])

export default CategoryMapping
