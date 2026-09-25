import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { limitCustomerAction } from "../../../modules/merchportal/request-limits"

type JoinBody = { join_code?: string }

export async function POST(req: AuthenticatedMedusaRequest<JoinBody>, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_id
  const code = req.body?.join_code?.trim().toUpperCase()
  if (!actorId || !code) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Company code is required")
  if (code.length > 64 || !/^[A-Z0-9_-]+$/.test(code)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Company code is invalid")
  limitCustomerAction("join", actorId)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const organizations = await service.listOrganizations({ join_code: code, status: "active" }, { take: 1 })
  if (!organizations.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Company code is invalid")
  const existing = await service.listMemberships({ actor_id: actorId, actor_type: "customer" }, { take: 1 })
  const input = { organization_id: organizations[0].id, actor_id: actorId, actor_type: "customer", role: "client_buyer", status: "active" }
  const membership = existing.length
    ? await service.updateMemberships({ id: existing[0].id, ...input })
    : await service.createMemberships(input)
  res.status(201).json({ membership: { role: membership.role }, organization: { name: organizations[0].name } })
}
