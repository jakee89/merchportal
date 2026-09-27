import { randomBytes } from "node:crypto"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { validateQuoteDetails } from "../modules/merchportal/quote-details"

type Input = { actor_id: string; details: { company_name?: string; vat_number?: string; billing_address?: Record<string, unknown>; delivery_address?: Record<string, unknown> } }

const registerCompanyStep = createStep("register-portal-company", async (input: Input, { container }) => {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const existing = await service.listMemberships({ actor_id: input.actor_id, actor_type: "customer" }, { take: 1 })
  if (existing.length) return new StepResponse({ registered: true })
  const customers = container.resolve(Modules.CUSTOMER) as any
  const customer = await customers.retrieveCustomer(input.actor_id)
  const details = validateQuoteDetails({ ...input.details, contact_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "), contact_email: customer.email, phone: customer.phone || "" })
  const slug = details.company_name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "company"
  const organization = await service.createOrganizations({
    name: details.company_name,
    slug: `${slug}-${randomBytes(3).toString("hex")}`,
    join_code: randomBytes(4).toString("hex").toUpperCase(),
    billing_address: details.billing_address,
    shipping_address: details.delivery_address,
    status: "active",
  })
  await service.createMemberships({ organization_id: organization.id, actor_id: input.actor_id, actor_type: "customer", role: "client_admin", status: "active" })
  return new StepResponse({ registered: true })
})

export const registerPortalCompanyWorkflow = createWorkflow("register-portal-company", (input: Input) => new WorkflowResponse(registerCompanyStep(input)))
