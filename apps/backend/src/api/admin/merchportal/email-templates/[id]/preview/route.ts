import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { previewEmailTemplate } from "../../../../../../modules/merchportal/email-templates"
import { requireStaff } from "../../../auth"

export async function POST(req: AuthenticatedMedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  await requireStaff(req)
  res.setHeader("Cache-Control", "no-store")
  res.json({ preview: previewEmailTemplate(req.params.id, req.body || {}) })
}
