import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { saveEmailTemplate } from "../../../../../modules/merchportal/email-templates"
import { requireStaff } from "../../auth"

export async function POST(req: AuthenticatedMedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") {
    res.status(403).json({ message: "Only a super administrator can change email templates" })
    return
  }
  const service = req.scope.resolve(MERCHPORTAL_MODULE)
  await saveEmailTemplate(service, req.params.id, req.body || {}, req.auth_context.actor_id)
  res.json({ saved: true })
}
