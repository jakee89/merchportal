import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { limitCustomerAction } from "../../../modules/merchportal/request-limits"
import { registerPortalCompanyWorkflow } from "../../../workflows/register-portal-company"

type Body = { company_name?: string; vat_number?: string; billing_address?: Record<string, unknown>; delivery_address?: Record<string, unknown> }

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_id
  if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to register your company")
  limitCustomerAction("join", actorId)
  const { result } = await registerPortalCompanyWorkflow(req.scope).run({ input: { actor_id: actorId, details: req.body } })
  res.status(201).json(result)
}
