import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_id
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships({ actor_id: actorId, actor_type: "customer", status: "active" }, { take: 1 })
  if (!memberships.length) return res.json({ membership: null, organization: null })
  const organizations = await service.listOrganizations({ id: memberships[0].organization_id, status: "active" }, { take: 1 })
  const organization = organizations[0]
  res.json({
    membership: { role: memberships[0].role, permissions: memberships[0].permissions },
    organization: organization ? {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo_url: organization.logo_url,
      primary_color: organization.primary_color,
      secondary_color: organization.secondary_color,
      billing_address: organization.billing_address,
      shipping_address: organization.shipping_address,
    } : null,
  })
}
