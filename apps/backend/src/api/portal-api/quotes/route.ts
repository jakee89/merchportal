import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { customerQuoteContext } from "./auth"
import { quoteWithItems, submitQuoteCart } from "../../../workflows/quote-cart"
import { notifyStaffOfQuote } from "../../../workflows/quote-notifications"
import { validateQuoteDetails } from "../../../modules/merchportal/quote-details"

function address(value: any) {
  return { line1: String(value?.line1 || value?.address_1 || ""), line2: String(value?.line2 || value?.address_2 || ""), city: String(value?.city || ""), postal_code: String(value?.postal_code || ""), country_code: String(value?.country_code || "mt") }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership, actorId } = await customerQuoteContext(req)
  if (req.query.summary === "true") {
    const carts = await service.listQuoteRequests({ organization_id: membership.organization_id, status: "cart" }, { take: 1 })
    return res.json({ cart_count: Array.isArray(carts[0]?.item_ids) ? carts[0].item_ids.length : 0 })
  }
  const quotes = await service.listQuoteRequests({ organization_id: membership.organization_id }, { take: 50, order: { created_at: "DESC" } })
  const cart = quotes.find((quote: any) => quote.status === "cart")
  const customerService = req.scope.resolve(Modules.CUSTOMER) as any
  const customer = await customerService.retrieveCustomer(actorId)
  const organization = (await service.listOrganizations({ id: membership.organization_id }, { take: 1 }))[0]
  const profile = (customer.metadata?.merchportal_business || {}) as any
  const buyerDetails = {
    contact_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    contact_email: customer.email || "",
    phone: customer.phone || "",
    company_name: profile.company_name || organization?.name || "",
    vat_number: profile.vat_number || "",
    billing_address: address(profile.billing_address || organization?.billing_address),
    delivery_address: address(profile.delivery_address || organization?.shipping_address || profile.billing_address || organization?.billing_address),
  }
  res.json({ cart: cart ? await quoteWithItems(service, cart) : null, history: await Promise.all(quotes.filter((quote: any) => quote.status !== "cart").map((quote: any) => quoteWithItems(service, quote))), buyer_details: buyerDetails })
}

export async function POST(req: AuthenticatedMedusaRequest<{ note?: string; details?: unknown }>, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req, true)
  const note = String(req.body?.note || "").trim().slice(0, 2000)
  const details = validateQuoteDetails(req.body?.details)
  const quote = await submitQuoteCart(service, membership.organization_id, note, details)
  const notificationSent = await notifyStaffOfQuote(req.scope, quote)
  res.status(201).json({ quote: await quoteWithItems(service, quote), notification_sent: notificationSent })
}
