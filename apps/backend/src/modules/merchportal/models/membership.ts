import { model } from "@medusajs/framework/utils"

const Membership = model
  .define("merchportal_membership", {
    id: model.id().primaryKey(),
    organization_id: model.text().nullable(),
    actor_id: model.text(),
    actor_type: model.enum(["user", "customer"]),
    role: model.enum([
      "super_admin",
      "staff",
      "client_admin",
      "client_buyer",
      "client_viewer",
    ]),
    permissions: model.json().nullable(),
    status: model.enum(["active", "disabled"]).default("active"),
  })
  .indexes([
    { on: ["actor_type", "actor_id"], unique: true },
    { on: ["organization_id"] },
  ])

export default Membership
