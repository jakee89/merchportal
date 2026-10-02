import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"

export async function requireStaff(req: AuthenticatedMedusaRequest) {
  const actorId = req.auth_context?.actor_id
  if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in required")
  if (req.auth_context.auth_identity_id) {
    const auth = req.scope.resolve(Modules.AUTH)
    const enabled = await auth.listAuthMfa({ auth_identity_id: req.auth_context.auth_identity_id, status: "enabled" }, { take: 1 })
    // Also reject pre-enrollment tokens/sessions which don't yet carry the
    // mfa_enabled claim. Enrollment remains available in Medusa My Profile.
    if (enabled.length && !req.auth_context.mfa_challenge_completed_at) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in again and verify your authenticator code")
  }
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
