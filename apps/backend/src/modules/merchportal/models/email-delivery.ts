import { model } from "@medusajs/framework/utils"

export default model
  .define("merchportal_email_delivery", {
    id: model.id().primaryKey(),
    recipient: model.text(),
    template_id: model.text(),
    status: model.enum(["accepted", "failed"]),
    failure_code: model.text().nullable(),
  })
  .indexes([{ on: ["created_at"] }, { on: ["template_id", "created_at"] }])
