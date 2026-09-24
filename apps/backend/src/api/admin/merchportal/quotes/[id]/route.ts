import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { finalizeQuote, quoteWithItems } from "../../../../../workflows/quote-cart"
import { notifyCustomerOfFinalQuote } from "../../../../../workflows/quote-notifications"
import { requireStaff } from "../../auth"

export async function POST(req: AuthenticatedMedusaRequest<{ final_total?: number; note?: string }>, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const quote = await finalizeQuote(service, req.params.id, String(req.auth_context?.actor_id), Number(req.body?.final_total), String(req.body?.note || "").trim().slice(0, 2000))
  const notificationSent = await notifyCustomerOfFinalQuote(req.scope, quote)
  res.json({ quote: await quoteWithItems(service, quote), notification_sent: notificationSent })
}
