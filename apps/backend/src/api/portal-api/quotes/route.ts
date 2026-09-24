import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerQuoteContext } from "./auth"
import { quoteWithItems, submitQuoteCart } from "../../../workflows/quote-cart"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req)
  if (req.query.summary === "true") {
    const carts = await service.listQuoteRequests({ organization_id: membership.organization_id, status: "cart" }, { take: 1 })
    return res.json({ cart_count: Array.isArray(carts[0]?.item_ids) ? carts[0].item_ids.length : 0 })
  }
  const quotes = await service.listQuoteRequests({ organization_id: membership.organization_id }, { take: 50, order: { created_at: "DESC" } })
  const cart = quotes.find((quote: any) => quote.status === "cart")
  res.json({ cart: cart ? await quoteWithItems(service, cart) : null, history: await Promise.all(quotes.filter((quote: any) => quote.status !== "cart").map((quote: any) => quoteWithItems(service, quote))) })
}

export async function POST(req: AuthenticatedMedusaRequest<{ note?: string }>, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req, true)
  const note = String(req.body?.note || "").trim().slice(0, 2000)
  const quote = await submitQuoteCart(service, membership.organization_id, note)
  res.status(201).json({ quote: await quoteWithItems(service, quote) })
}
