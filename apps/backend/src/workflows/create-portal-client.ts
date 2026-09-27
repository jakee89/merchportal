import { randomBytes } from "node:crypto"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { loadEmailSettings, sendPortalEmail } from "../modules/merchportal/email-settings"
import { transactionalEmailHtml } from "../modules/merchportal/transactional-email"
import { validateQuoteDetails, type QuoteDetails } from "../modules/merchportal/quote-details"

type Input = QuoteDetails & { first_name: string; last_name: string; organization_id?: string }

const createClientStep = createStep("create-portal-client", async (input: Input, { container }) => {
  const firstName = String(input.first_name || "").trim()
  const lastName = String(input.last_name || "").trim()
  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter the client's first and last name")
  const details = validateQuoteDetails(input)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.verified || !settings.encrypted_password) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Verify Zoho SMTP and the no-reply sender in Settings before inviting clients")
  const customers = container.resolve(Modules.CUSTOMER) as any
  if ((await customers.listCustomers({ email: details.contact_email }, { take: 1 })).length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This email already has a customer account")

  let organization: any
  if (input.organization_id) {
    organization = (await service.listOrganizations({ id: input.organization_id, status: "active" }, { take: 1 }))[0]
    if (!organization) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Company not found")
  }

  const password = randomBytes(24).toString("base64url")
  const auth = container.resolve(Modules.AUTH) as any
  const registration = await auth.register("emailpass", { body: { email: details.contact_email, password } })
  if (!registration.success || !registration.authIdentity?.id) throw new MedusaError(MedusaError.Types.INVALID_DATA, registration.error || "Could not create the client login")
  const { result: customer } = await createCustomerAccountWorkflow(container).run({
    input: { authIdentityId: registration.authIdentity.id, customerData: {
      email: details.contact_email,
      first_name: firstName,
      last_name: lastName,
      phone: details.phone,
      company_name: details.company_name,
      metadata: { merchportal_business: { ...details, contact_email: undefined } },
    } },
  })
  if (!organization) {
    const slug = details.company_name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "company"
    organization = await service.createOrganizations({
      name: details.company_name,
      slug: `${slug}-${randomBytes(3).toString("hex")}`,
      join_code: randomBytes(4).toString("hex").toUpperCase(),
      billing_address: details.billing_address,
      shipping_address: details.delivery_address,
      status: "active",
    })
  }
  await service.createMemberships({ organization_id: organization.id, actor_id: customer.id, actor_type: "customer", role: "client_buyer", status: "active" })
  const origin = (process.env.STOREFRONT_URL || "https://merchportal.customislandgifts.mt").replace(/\/$/u, "")
  const loginUrl = `${origin}/portal/login`
  let emailSent = false
  try {
    emailSent = await sendPortalEmail(service, details.contact_email, "Your MerchPortal account is ready", `Hello ${firstName},\n\nYour MerchPortal account is ready.\nEmail: ${details.contact_email}\nTemporary password: ${password}\nSign in: ${loginUrl}\n\nPlease change your password using Forgot password after signing in.`, false, transactionalEmailHtml("Your account is ready", `Hello ${firstName}, your business account has been created. Use the temporary password below to sign in, then change it using Forgot password.`, "Sign in to MerchPortal", loginUrl, `Email: ${details.contact_email}\nTemporary password: ${password}`), true)
  } catch (error) {
    console.error("Client invite email failed", error instanceof Error ? error.message : "Unknown SMTP error")
  }
  return new StepResponse({ customer_id: customer.id, organization_id: organization.id, email_sent: emailSent })
})

export const createPortalClientWorkflow = createWorkflow("create-portal-client", (input: Input) => new WorkflowResponse(createClientStep(input)))
