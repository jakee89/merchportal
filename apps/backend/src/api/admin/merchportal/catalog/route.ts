import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { normalizeSupplierCatalog } from "../../../../modules/merchportal/normalization"
import { publishNormalizedProductsWorkflow } from "../../../../workflows/publish-normalized-products"
import { requireStaff } from "../auth"

type Body = { source_keys?: string[] }

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const products = await normalizeSupplierCatalog(req.scope, {
    take: 24,
    skip: offset,
  })
  res.json({ products })
}

export async function POST(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) {
  await requireStaff(req)
  if (!req.body?.source_keys?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Select at least one product"
    )
  }
  const { result } = await publishNormalizedProductsWorkflow(req.scope).run({
    input: { source_keys: req.body.source_keys },
  })
  res.status(201).json(result)
}
