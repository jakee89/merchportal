import { model } from "@medusajs/framework/utils"

const ProductConfiguration = model
  .define("merchportal_product_configuration", {
    id: model.id().primaryKey(),
    organization_id: model.text(),
    actor_id: model.text(),
    product_id: model.text(),
    variant_id: model.text(),
    quantity: model.number(),
    color: model.text(),
    branding_method: model.text().nullable(),
    print_position: model.text().nullable(),
    print_colours: model.number().nullable(),
    print_width_mm: model.number().nullable(),
    print_height_mm: model.number().nullable(),
    decoration_lines: model.json().nullable(),
    artwork_file_id: model.text().nullable(),
    artwork_filename: model.text().nullable(),
    base_unit_price: model.number(),
    branding_unit_price: model.number().default(0),
    setup_price: model.number().default(0),
    estimated_total: model.number(),
    branding_price_pending: model.boolean().default(false),
    status: model.enum(["draft", "ready"]).default("draft"),
  })
  .indexes([{ on: ["organization_id", "created_at"] }, { on: ["actor_id", "created_at"] }, { on: ["product_id"] }])

export default ProductConfiguration
