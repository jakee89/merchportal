import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { setupMerchPortalWorkflow } from "../../../../workflows/setup-merchportal"
import { requireStaff } from "../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const { result } = await setupMerchPortalWorkflow(req.scope).run({
    input: { user_id: req.auth_context!.actor_id! },
  })
  res.json({ setup: result })
}
