import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { requireStaff } from "../../auth"
import { deletePortalClientWorkflow } from "../../../../../workflows/delete-portal-client"

type Body = { confirm_email?: string }

export async function DELETE(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (!staff.permissions?.includes("*") && staff.role !== "super_admin") {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Only a super administrator can delete client accounts")
  }
  const { result } = await deletePortalClientWorkflow(req.scope).run({
    input: { customer_id: req.params.id, confirm_email: String(req.body?.confirm_email || "") },
  })
  res.json(result)
}
