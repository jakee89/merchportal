import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"

export async function requireStaff(req: AuthenticatedMedusaRequest) {
  const actorId = req.auth_context?.actor_id
  if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in required")
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships(
    { actor_id: actorId, actor_type: "user", status: "active" },
    { take: 1 }
  )
  if (!memberships.length) {
    const staff = await service.listMemberships({ actor_type: "user" }, { take: 1 })
    if (staff.length) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "No staff role assigned")
    }
    return service.createMemberships({
      actor_id: actorId,
      actor_type: "user",
      role: "super_admin",
      permissions: ["*"],
      status: "active",
    })
  }
  return memberships[0]
}
