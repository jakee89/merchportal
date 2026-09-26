import { model } from "@medusajs/framework/utils"

const FacetMapping = model.define("merchportal_facet_mapping", {
  id: model.id().primaryKey(),
  supplier_id: model.text(),
  facet_type: model.enum(["color", "material"]),
  source_value: model.text(),
  target_value: model.text(),
}).indexes([{ on: ["supplier_id", "facet_type", "source_value"], unique: true }])

export default FacetMapping
