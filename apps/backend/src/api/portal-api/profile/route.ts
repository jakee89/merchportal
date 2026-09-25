import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buyerProfile, updateBuyerProfile } from "../../../modules/merchportal/buyer-profile"
import { customerQuoteContext } from "../quotes/auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership, actorId } = await customerQuoteContext(req)
  res.json({ profile: await buyerProfile(req.scope, service, actorId, membership.organization_id) })
}

export async function PUT(req: AuthenticatedMedusaRequest<{ details?: unknown }>, res: MedusaResponse) {
  const { service, membership, actorId } = await customerQuoteContext(req)
  res.json({ profile: await updateBuyerProfile(req.scope, service, actorId, membership.organization_id, req.body?.details) })
}
