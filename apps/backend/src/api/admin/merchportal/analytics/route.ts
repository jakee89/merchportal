import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { portalUsageOverview } from "../../../../modules/merchportal/portal-usage"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  res.json(await portalUsageOverview(req.scope, 30))
}
