import { Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { portalUsageByActors } from "./portal-usage"

export async function listPortalClients(container: any, offset: number, limit: number) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const customers = container.resolve(Modules.CUSTOMER) as any
  const [memberships, count] = await service.listAndCountMemberships(
    { actor_type: "customer" },
    { skip: offset, take: limit, order: { created_at: "DESC" } }
  )
  const ids = memberships.map((membership: any) => membership.actor_id)
  if (!ids.length) return { clients: [], count }
  const organizationIds = [...new Set(memberships.map((membership: any) => membership.organization_id).filter(Boolean))]
  const [customerRows, organizations, usageByActor] = await Promise.all([
    customers.listCustomers({ id: ids }, { take: ids.length }),
    organizationIds.length ? service.listOrganizations({ id: organizationIds }, { take: organizationIds.length }) : [],
    portalUsageByActors(container, ids),
  ])
  const customerById = new Map(customerRows.map((customer: any) => [customer.id, customer]))
  const organizationById = new Map(organizations.map((organization: any) => [organization.id, organization]))
  const clients: any[] = []
  for (let index = 0; index < memberships.length; index += 5) {
    const page = await Promise.all(memberships.slice(index, index + 5).map(async (membership: any) => {
    const customer = customerById.get(membership.actor_id) as any
    const organization = organizationById.get(membership.organization_id) as any
    const business = customer?.metadata?.merchportal_business || {}
    const [quotes, configurations] = await Promise.all([
      service.listAndCountQuoteRequests(
        { actor_id: membership.actor_id, status: ["submitted", "quoted"] },
        { take: 1, order: { created_at: "DESC" }, select: ["id", "submitted_at", "created_at"] }
      ),
      service.listAndCountProductConfigurations(
        { actor_id: membership.actor_id },
        { take: 1, order: { updated_at: "DESC" }, select: ["id", "updated_at"] }
      ),
    ])
    return {
      id: membership.actor_id,
      membership_id: membership.id,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || business.contact_name || "Client",
      email: customer?.email || business.contact_email || "",
      phone: customer?.phone || business.phone || "",
      company_name: customer?.company_name || business.company_name || organization?.name || "",
      vat_number: business.vat_number || "",
      billing_address: business.billing_address || organization?.billing_address || null,
      delivery_address: business.delivery_address || organization?.shipping_address || null,
      organization_id: membership.organization_id,
      organization_name: organization?.name || "",
      role: membership.role,
      status: membership.status,
      created_at: customer?.created_at || membership.created_at,
      quote_count: quotes[1],
      last_quote_at: quotes[0]?.[0]?.submitted_at || quotes[0]?.[0]?.created_at || null,
      configuration_count: configurations[1],
      last_configuration_at: configurations[0]?.[0]?.updated_at || null,
      usage: usageByActor.get(membership.actor_id) || { login_count: 0, page_view_count: 0, product_view_count: 0, active_seconds: 0, last_seen_at: null },
    }
    }))
    clients.push(...page)
  }
  return { clients, count }
}
