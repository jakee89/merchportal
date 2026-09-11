import { model } from "@medusajs/framework/utils"

const ImportJob = model
  .define("merchportal_import_job", {
    id: model.id().primaryKey(),
    supplier_id: model.text(),
    kind: model.enum(["catalog", "price", "stock"]),
    trigger: model.enum(["manual", "scheduled"]),
    status: model.enum(["queued", "running", "completed", "failed"]),
    phase: model.text().default("queued"),
    current_message: model.text().nullable(),
    total_records: model.number().default(0),
    progress_percent: model.number().default(0),
    processed: model.number().default(0),
    created_count: model.number().default(0),
    updated_count: model.number().default(0),
    skipped_count: model.number().default(0),
    error_count: model.number().default(0),
    started_at: model.dateTime().nullable(),
    completed_at: model.dateTime().nullable(),
    error_message: model.text().nullable(),
    log: model.json().nullable(),
  })
  .indexes([{ on: ["supplier_id", "created_at"] }])

export default ImportJob
