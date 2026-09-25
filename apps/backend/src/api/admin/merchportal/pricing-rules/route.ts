import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { managePricingRulesWorkflow } from "../../../../workflows/manage-pricing-rules"
import { requireStaff } from "../auth"

type Body = { organization_id?: string | null; supplier_code?: string; markup_percentage?: number; quantity_tiers?: Array<{ min_quantity: number; max_quantity: number | null; markup_percentage: number }> }

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
