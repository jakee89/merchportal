import { model } from "@medusajs/framework/utils"

const QuoteRequest = model
  .define("merchportal_quote_request", {
    id: model.id().primaryKey(),
    organization_id: model.text(),
    actor_id: model.text(),
    item_ids: model.json(),
    status: model.enum(["cart", "submitted", "quoted"]).default("cart"),
    customer_note: model.text().nullable(),
    staff_note: model.text().nullable(),
    estimated_total: model.number().nullable(),
    final_total: model.number().nullable(),
    quoted_by: model.text().nullable(),
    submitted_at: model.dateTime().nullable(),
    quoted_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["organization_id", "created_at"] }, { on: ["status", "created_at"] }])

export default QuoteRequest
