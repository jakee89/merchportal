import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { listEmailTemplates } from "../../../../modules/merchportal/email-templates"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const staff = await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE)
  res.setHeader("Cache-Control", "no-store")
  res.json({ templates: await listEmailTemplates(service), can_edit: staff.role === "super_admin" })
}
