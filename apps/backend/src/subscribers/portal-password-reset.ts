import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { sendPortalEmail } from "../modules/merchportal/email-settings"

type PasswordResetEvent = { entity_id: string; token: string; actor_type: string }

export default async function portalPasswordReset({ event: { data }, container }: SubscriberArgs<PasswordResetEvent>) {
  if (data.actor_type !== "customer" || !data.entity_id || !data.token) return
  const service = container.resolve(MERCHPORTAL_MODULE)
  const origin = (process.env.STOREFRONT_URL || "https://merchportal.customislandgifts.mt").replace(/\/$/, "")
  const url = `${origin}/portal/reset-password?email=${encodeURIComponent(data.entity_id)}&token=${encodeURIComponent(data.token)}`
  const sent = await sendPortalEmail(service, data.entity_id, "Reset your MerchPortal password", `Use this link to reset your password: ${url}\n\nIf you did not request this, you can ignore this message.`)
  if (!sent) console.error("Password reset email could not be sent because SMTP is not configured")
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
