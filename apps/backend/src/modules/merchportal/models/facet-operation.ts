import { model } from "@medusajs/framework/utils"

const FacetOperation = model.define("merchportal_facet_operation", {
  id: model.id().primaryKey(),
  actor_id: model.text(),
  facet_type: model.enum(["color", "material", "category", "print_method"]),
  kind: model.enum(["change", "ai_review"]),
  status: model.enum(["running", "ready", "applied", "undone", "failed"]),
  data: model.json(),
}).indexes([{ on: ["kind", "created_at"] }])

export default FacetOperation
