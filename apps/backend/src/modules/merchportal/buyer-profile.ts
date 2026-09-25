import { Modules } from "@medusajs/framework/utils"
import { validateQuoteDetails } from "./quote-details"

function address(value: any) {
  return { line1: String(value?.line1 || value?.address_1 || ""), line2: String(value?.line2 || value?.address_2 || ""), city: String(value?.city || ""), postal_code: String(value?.postal_code || ""), country_code: String(value?.country_code || "mt") }
}

export async function buyerProfile(scope: any, service: any, actorId: string, organizationId: string) {
  const customers = scope.resolve(Modules.CUSTOMER) as any
  const customer = await customers.retrieveCustomer(actorId)
  const organization = (await service.listOrganizations({ id: organizationId }, { take: 1 }))[0]
  const profile = (customer.metadata?.merchportal_business || {}) as any
  return {
    contact_name: profile.contact_name || [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    contact_email: customer.email || "",
    phone: customer.phone || "",
    company_name: profile.company_name || organization?.name || "",
    vat_number: profile.vat_number || "",
    billing_address: address(profile.billing_address || organization?.billing_address),
    delivery_address: address(profile.delivery_address || organization?.shipping_address || profile.billing_address || organization?.billing_address),
  }
}

export async function updateBuyerProfile(scope: any, service: any, actorId: string, organizationId: string, input: unknown) {
  const customers = scope.resolve(Modules.CUSTOMER) as any
  const customer = await customers.retrieveCustomer(actorId)
  const details = validateQuoteDetails({ ...(input as object), contact_email: customer.email })
  await customers.updateCustomers(actorId, { phone: details.phone, metadata: { ...(customer.metadata || {}), merchportal_business: { ...details, contact_email: undefined } } })
  return buyerProfile(scope, service, actorId, organizationId)
}
