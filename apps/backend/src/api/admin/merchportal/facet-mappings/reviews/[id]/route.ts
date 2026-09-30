import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { acceptFacetReview, cancelFacetReview, refreshFacetReview, resumeFacetReview } from "../../../../../../modules/merchportal/facet-ai"
import { requireStaff } from "../../../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  res.json({ review: await refreshFacetReview(req.scope, req.params.id) })
}

export async function POST(req: AuthenticatedMedusaRequest<{ groups: Array<{ id: number; target_value: string }>; resume?: boolean }>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (req.body?.resume === true) return res.json({ review: await resumeFacetReview(req.scope, req.params.id) })
  res.json(await acceptFacetReview(req.scope, staff.actor_id, req.params.id, req.body?.groups))
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  await cancelFacetReview(req.scope, req.params.id)
  res.json({ stopped: true })
}
