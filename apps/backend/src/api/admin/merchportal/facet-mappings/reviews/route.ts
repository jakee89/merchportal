import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { facetTypes, type FacetType } from "../../../../../modules/merchportal/facet-mappings"
import { startFacetReview } from "../../../../../modules/merchportal/facet-ai"
import { requireStaff } from "../../auth"

export async function POST(req: AuthenticatedMedusaRequest<{ facet_type: FacetType; supplier_id?: string }>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (!facetTypes.includes(req.body?.facet_type) || (req.body.supplier_id !== undefined && typeof req.body.supplier_id !== "string")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a filter type")
  res.status(202).json({ review: await startFacetReview(req.scope, staff.actor_id, req.body.facet_type, req.body.supplier_id) })
}
