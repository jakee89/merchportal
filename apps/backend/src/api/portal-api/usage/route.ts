import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerQuoteContext } from "../quotes/auth"
import { recordPortalUsage, type UsageIncrement } from "../../../modules/merchportal/portal-usage"

export async function POST(req: AuthenticatedMedusaRequest<UsageIncrement>, res: MedusaResponse) {
  const { actorId } = await customerQuoteContext(req)
  await recordPortalUsage(req.scope, actorId, req.body)
  res.status(204).send()
}
