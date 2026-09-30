import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { publicFacetAiSettings, saveFacetAiKey } from "../../../../../modules/merchportal/facet-ai"
import { requireStaff } from "../../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  res.json(await publicFacetAiSettings(req.scope.resolve(MERCHPORTAL_MODULE)))
}

export async function POST(req: AuthenticatedMedusaRequest<{ api_key: string }>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Only a super administrator can change the OpenAI key")
  res.json(await saveFacetAiKey(req.scope.resolve(MERCHPORTAL_MODULE), req.body?.api_key))
}
