import { model } from "@medusajs/framework/utils"

const FacetValue = model.define("merchportal_facet_value", {
  id: model.id().primaryKey(),
  supplier_id: model.text(),
  facet_type: model.enum(["color", "material", "category", "print_method"]),
  source_value: model.text(),
  first_seen_at: model.dateTime(),
}).indexes([{ on: ["supplier_id", "facet_type", "source_value"], unique: true }])

export default FacetValue
