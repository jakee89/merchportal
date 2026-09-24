import { model } from "@medusajs/framework/utils"

const PortalSetting = model
  .define("merchportal_setting", {
    id: model.id().primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ on: ["key"], unique: true }])

export default PortalSetting
