import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { managePricingRulesWorkflow } from "../../../../workflows/manage-pricing-rules"
import { requireStaff } from "../auth"

type Body = { organization_id?: string | null; markup_percentage?: number }

async function run(req: AuthenticatedMedusaRequest<Body>) {
  await requireStaff(req)
  return managePricingRulesWorkflow(req.scope).run({ input: req.body || {} })
}

export async function GET(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) {
  const { result } = await run(req)
  res.json(result)
}

export async function POST(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) {
  const { result } = await run(req)
  res.json(result)
}
