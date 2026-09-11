import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { requireStaff } from "../../../auth"

type MemberBody = { customer_id?: string; role?: "client_admin" | "client_buyer" | "client_viewer" }

export async function POST(req: AuthenticatedMedusaRequest<MemberBody>, res: MedusaResponse) {
  await requireStaff(req)
  if (!req.body?.customer_id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Customer ID is required")
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const organizations = await service.listOrganizations({ id: req.params.id, status: "active" }, { take: 1 })
  if (!organizations.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Company not found")
  const existing = await service.listMemberships({ actor_id: req.body.customer_id, actor_type: "customer" }, { take: 1 })
  const input = {
    organization_id: req.params.id,
    actor_id: req.body.customer_id,
    actor_type: "customer",
    role: req.body.role || "client_buyer",
    status: "active",
  }
  const membership = existing.length
    ? await service.updateMemberships({ id: existing[0].id, ...input })
    : await service.createMemberships(input)
  res.status(201).json({ membership })
}
