import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { loadEmailSettings, sendPortalEmail } from "../modules/merchportal/email-settings"

export async function notifyStaffOfQuote(container: MedusaContainer, quote: any) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) return false
  try {
    return await sendPortalEmail(
      service,
      settings.notification_email,
      `New MerchPortal quote request ${quote.id}`,
      `A client requested a quote for ${Array.isArray(quote.item_ids) ? quote.item_ids.length : 0} product(s).\n\nOpen https://api.merchportal.customislandgifts.mt/app/merchportal to review quote ${quote.id}.`,
    )
  } catch (error) {
    console.error("MerchPortal could not send staff quote notification", error instanceof Error ? error.message : "Unknown SMTP error")
    return false
  }
}

export async function notifyCustomerOfFinalQuote(container: MedusaContainer, quote: any) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) return false
  try {
    const customers = container.resolve(Modules.CUSTOMER) as any
    const customer = await customers.retrieveCustomer(quote.actor_id)
    if (!customer?.email) return false
    return await sendPortalEmail(
      service,
      customer.email,
      `Your MerchPortal quote ${quote.id} is ready`,
      `Your final quote is €${Number(quote.final_total).toFixed(2)} excluding VAT.\n\nOpen https://merchportal.customislandgifts.mt/portal/account/quotes to review it.\n\n${quote.staff_note || ""}`,
    )
  } catch (error) {
    console.error("MerchPortal could not send client quote notification", error instanceof Error ? error.message : "Unknown SMTP error")
    return false
  }
}
