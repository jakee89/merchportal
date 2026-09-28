import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setSupplierPriority } from "../../../../../../modules/merchportal/supplier-priority"
import { requireStaff } from "../../../auth"

type Body = { priority?: number }

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  await requireStaff(req)
  const { code } = req.params
  const suppliers = await setSupplierPriority(req.scope, code, req.body?.priority as number)
  res.json({ suppliers })
}
