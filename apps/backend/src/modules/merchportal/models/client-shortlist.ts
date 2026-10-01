import { model } from "@medusajs/framework/utils"

export default model
  .define("merchportal_client_shortlist", {
    id: model.id().primaryKey(),
    actor_id: model.text(),
    organization_id: model.text(),
    name: model.text(),
  })
  .indexes([{ on: ["actor_id", "organization_id"] }])
