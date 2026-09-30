import { model } from "@medusajs/framework/utils"

const MediaHealth = model.define("merchportal_media_health", {
  id: model.id().primaryKey(),
  available: model.boolean(),
  checked_at: model.dateTime(),
})

export default MediaHealth
