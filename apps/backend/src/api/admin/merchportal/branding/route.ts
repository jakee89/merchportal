import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { loadPortalBranding, savePortalBranding } from "../../../../modules/merchportal/portal-branding"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  res.json({ branding: await loadPortalBranding(req.scope.resolve(MERCHPORTAL_MODULE)) })
}

export async function POST(req: AuthenticatedMedusaRequest<Record<string, unknown>>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") return res.status(403).json({ message: "Only a super administrator can change the portal logo" })
  res.json({ branding: await savePortalBranding(req.scope.resolve(MERCHPORTAL_MODULE), req.body || {}) })
}
