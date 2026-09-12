import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { resetSupplierCatalogWorkflow } from "../../../../../workflows/reset-supplier-catalog"
import { requireStaff } from "../../auth"

type Body = { confirmation?: string }

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  await requireStaff(req)
  if (req.body.confirmation !== "RESET") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Type RESET to confirm")
  }
  const { result } = await resetSupplierCatalogWorkflow(req.scope).run()
  res.json({ reset: result })
}
