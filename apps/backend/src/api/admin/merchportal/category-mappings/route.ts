import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { manageCategoryMappingsWorkflow } from "../../../../workflows/manage-category-mappings"
import { requireStaff } from "../auth"

type Body = {
  mapping_id?: string
  action?: "approve" | "ignore" | "change"
  category?: string
}

async function run(req: AuthenticatedMedusaRequest<Body>) {
  await requireStaff(req)
  return manageCategoryMappingsWorkflow(req.scope).run({
    input: req.body || {},
  })
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
