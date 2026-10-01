import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function emailDeliveryRetention(
  container: MedusaContainer,
) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const cutoff = new Date(Date.now() - 90 * 86_400_000)
  await knex("merchportal_email_delivery")
    .where("created_at", "<", cutoff)
    .delete()
}

export const config = {
  name: "email-delivery-retention",
  schedule: "55 3 * * *",
}
