import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { requireStaff } from "../../auth"

type Body = {
  name?: string
  status?: "active" | "disabled"
  logo_url?: string | null
  primary_color?: string
  secondary_color?: string
  billing_address?: Record<string, unknown> | null
  shipping_address?: Record<string, unknown> | null
}

export async function PATCH(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const organization = await service.updateOrganizations({ id: req.params.id, ...req.body })
  res.json({ organization })
}
