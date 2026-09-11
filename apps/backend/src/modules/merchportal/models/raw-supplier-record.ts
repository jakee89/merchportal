import { model } from "@medusajs/framework/utils"

const RawSupplierRecord = model
  .define("merchportal_raw_supplier_record", {
    id: model.id().primaryKey(),
    supplier_id: model.text(),
    import_job_id: model.text(),
    record_type: model.enum(["product", "price", "stock", "category", "decoration"]),
    external_id: model.text(),
    sku: model.text().nullable(),
    checksum: model.text(),
    payload: model.json(),
    source_image_urls: model.json().nullable(),
    first_seen_at: model.dateTime(),
    last_seen_at: model.dateTime(),
    source_updated_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      on: ["supplier_id", "record_type", "external_id"],
      unique: true,
    },
    { on: ["sku"] },
  ])

export default RawSupplierRecord
