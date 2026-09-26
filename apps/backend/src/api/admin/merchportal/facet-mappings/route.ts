import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { facetMappingOptions, facetTypes, removeFacetMappings, saveFacetMappings, type FacetType } from "../../../../modules/merchportal/facet-mappings"
import { clearPortalCatalogCache } from "../../../../modules/merchportal/catalog-cache"
import { requireStaff } from "../auth"

type Body = { facet_type: FacetType; sources: Array<{ supplier_id: string; source_value: string }>; target_value: string }

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  res.json({ options: await facetMappingOptions(service) })
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  await requireStaff(req)
  const input = req.body
  if (!input || !facetTypes.includes(input.facet_type) || !Array.isArray(input.sources) || input.sources.some((item) => typeof item?.supplier_id !== "string" || typeof item?.source_value !== "string") || typeof input.target_value !== "string") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid filter mapping")
  }
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  try { await saveFacetMappings(service, input) } catch (error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, error instanceof Error ? error.message : "Unable to save mapping")
  }
  clearPortalCatalogCache()
  res.json({ options: await facetMappingOptions(service) })
}

export async function DELETE(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  await requireStaff(req)
  const input = req.body
  if (!input || !facetTypes.includes(input.facet_type) || !Array.isArray(input.sources) || input.sources.some((item) => typeof item?.supplier_id !== "string" || typeof item?.source_value !== "string")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid filter mapping")
  }
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  await removeFacetMappings(service, input)
  clearPortalCatalogCache()
  res.json({ options: await facetMappingOptions(service) })
}
