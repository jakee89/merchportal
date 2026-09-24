import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { loadEmailSettings, publicEmailSettings, saveEmailSettings } from "../../../../modules/merchportal/email-settings"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  res.json({ email: publicEmailSettings(await loadEmailSettings(service)) })
}

export async function POST(req: AuthenticatedMedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") {
    res.status(403).json({ message: "Only a super administrator can change email settings" })
    return
  }
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  res.json({ email: await saveEmailSettings(service, req.body || {}) })
}
