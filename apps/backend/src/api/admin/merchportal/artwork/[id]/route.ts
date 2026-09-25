import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { sendArtworkDownload } from "../../../../../modules/merchportal/artwork-download"
import { requireStaff } from "../../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const configuration = (await service.listProductConfigurations({ id: req.params.id }, { take: 1 }))[0]
  if (!configuration) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork is not available")
  await sendArtworkDownload(req.scope, res, configuration)
}
