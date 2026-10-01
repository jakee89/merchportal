import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { facetTypes, type FacetType } from "../../../../modules/merchportal/facet-mappings"
import { applyFacetChange, facetDashboard, previewFacetChange, renameFacetMap, suggestedFacetGroups, undoFacetChange } from "../../../../modules/merchportal/facet-tools"
import { protectFacetGroup } from "../../../../modules/merchportal/facet-protection"
import { requireStaff } from "../auth"

type Body = { action?: "rename" | "undo" | "groups" | "preview" | "protect"; locked?: boolean; change_id?: string; from?: string; groups?: any[]; facet_type: FacetType; sources: Array<{ supplier_id: string; source_value: string }>; target_value: string }

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const dashboard = await facetDashboard(service)
  res.json({ ...dashboard, suggestions: suggestedFacetGroups(dashboard.options) })
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  const input = req.body
  if (input?.action === "preview") return res.json({ preview: await previewFacetChange(req.scope, input.facet_type, input.groups || []) })
  if (input?.action === "protect") {
    await protectFacetGroup(req.scope, staff.actor_id, input.facet_type, input.target_value, input.locked!)
    return GET(req, res)
  }
  if (input?.action === "undo" && typeof input.change_id === "string") {
    await undoFacetChange(req.scope, input.change_id)
    return GET(req, res)
  }
  if (input?.action === "rename" && facetTypes.includes(input.facet_type) && typeof input.from === "string" && typeof input.target_value === "string") {
    await renameFacetMap(req.scope, staff.actor_id, input.facet_type, input.from, input.target_value)
    return GET(req, res)
  }
  if (input?.action === "groups" && facetTypes.includes(input.facet_type)) {
    await applyFacetChange(req.scope, staff.actor_id, input.facet_type, input.groups || [])
    return GET(req, res)
  }
  if (!input || !facetTypes.includes(input.facet_type) || !Array.isArray(input.sources) || input.sources.some((item) => typeof item?.supplier_id !== "string" || typeof item?.source_value !== "string") || typeof input.target_value !== "string") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid filter mapping")
  }
  try { await applyFacetChange(req.scope, staff.actor_id, input.facet_type, [{ target_value: input.target_value, sources: input.sources }]) } catch (error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, error instanceof Error ? error.message : "Unable to save mapping")
  }
  return GET(req, res)
}

export async function DELETE(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  const input = req.body
  if (!input || !facetTypes.includes(input.facet_type) || !Array.isArray(input.sources) || input.sources.some((item) => typeof item?.supplier_id !== "string" || typeof item?.source_value !== "string")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid filter mapping")
  }
  await applyFacetChange(req.scope, staff.actor_id, input.facet_type, [{ target_value: null, sources: input.sources }])
  return GET(req, res)
}
