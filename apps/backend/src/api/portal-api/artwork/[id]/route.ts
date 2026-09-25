import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { sendArtworkDownload } from "../../../../modules/merchportal/artwork-download"
import { customerQuoteContext } from "../../quotes/auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req)
  const configuration = (await service.listProductConfigurations({ id: req.params.id, organization_id: membership.organization_id }, { take: 1 }))[0]
  if (!configuration) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork is not available")
  await sendArtworkDownload(req.scope, res, configuration)
}
