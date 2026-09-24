import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerQuoteContext } from "../../auth"
import { removeConfigurationFromCart } from "../../../../../workflows/quote-cart"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req, true)
  const cart = await removeConfigurationFromCart(service, membership.organization_id, req.params.id)
  res.json({ cart: cart.id })
}
