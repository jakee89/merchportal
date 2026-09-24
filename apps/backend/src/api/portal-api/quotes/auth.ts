import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"

export async function customerQuoteContext(req: AuthenticatedMedusaRequest, write = false) {
  const actorId = req.auth_context?.actor_id
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const membership = actorId ? (await service.listMemberships({ actor_id: actorId, actor_type: "customer", status: "active" }, { take: 1 }))[0] : null
  if (!membership?.organization_id) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Active company membership required")
  if (write && membership.role === "client_viewer") throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Your account cannot change quote requests")
  return { service, membership, actorId }
}
