import { model } from "@medusajs/framework/utils"

const PublishedProductSource = model
  .define("merchportal_published_product_source", {
    id: model.id().primaryKey(),
    source_key: model.text(),
    product_id: model.text(),
    supplier_id: model.text(),
    cost_by_sku: model.json(),
    lead_time: model.text().nullable(),
    sustainable: model.boolean().default(false),
    print_methods: model.json().nullable(),
    decoration_options: model.json().nullable(),
    attributes: model.json().nullable(),
    catalog_document: model.json().nullable(),
    catalog_preview: model.json().nullable(),
  })
  .indexes([{ on: ["source_key"], unique: true }, { on: ["product_id"], unique: true }, { on: ["supplier_id"] }])

export default PublishedProductSource
