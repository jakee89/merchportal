import { MedusaError } from "@medusajs/framework/utils"
import { sendPortalEmail } from "./email-settings"
import { transactionalEmailHtml } from "./transactional-email"
import { emailFailureCode, recordEmailDelivery } from "./email-delivery-history"

export type EmailTemplateId = "password-reset" | "client-invitation" | "staff-quote-request" | "client-quote-ready" | "smtp-test"
type Variables = Record<string, string>
type TemplateContent = { subject: string; html: string }
type Definition = TemplateContent & {
  id: EmailTemplateId
  name: string
  audience: string
  trigger: string
  variables: string[]
  required: string[]
  sample: Variables
}

const exampleUrl = "https://example.com/portal"
const staffHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f8fc;padding:24px;font-family:Arial,sans-serif;color:#193047"><div style="max-width:760px;margin:auto;background:white;border:1px solid #dce6f0;border-radius:16px;padding:24px"><p style="color:#086bea;font-weight:700;letter-spacing:.12em">MERCHPORTAL · NEW REQUEST</p><h1 style="margin:0 0 18px">Quote request {{quote_id}}</h1><p><strong>Company:</strong> {{company_name}}<br><strong>Contact:</strong> {{contact_name}}<br><strong>Email:</strong> {{contact_email}}<br><strong>Phone:</strong> {{phone}}<br><strong>VAT:</strong> {{vat_number}}</p><p><strong>Billing:</strong> {{billing_address}}<br><strong>Delivery:</strong> {{delivery_address}}</p><p><strong>Client note:</strong> {{customer_note}}</p><h2>Products · {{item_count}}</h2>{{quote_items_html}}<p><a href="{{review_url}}" style="display:inline-block;background:#086bea;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Open quote requests</a></p><p style="font-size:12px;color:#65758a">Artwork links require a staff login. Images may be hidden by your email app until you allow them.</p></div></body></html>`

export const emailTemplateDefinitions: Definition[] = [
  {
    id: "password-reset", name: "Password reset", audience: "Client",
    trigger: "A client requests a password reset.",
    subject: "Reset your MerchPortal password",
    html: transactionalEmailHtml("Reset your password", "Use the secure link below to choose a new password. If you did not request this, you can ignore this email.", "Reset password", "{{reset_url}}"),
    variables: ["reset_url", "client_email"], required: ["reset_url"],
    sample: { reset_url: `${exampleUrl}/reset-password?email=client%40example.com&token=PREVIEW-ONLY`, client_email: "client@example.com" },
  },
  {
    id: "client-invitation", name: "Client account invitation", audience: "Client",
    trigger: "An administrator creates a client account.",
    subject: "Your MerchPortal account is ready",
    html: transactionalEmailHtml("Your account is ready", "Hello {{first_name}}, your business account has been created. Use the temporary password below to sign in, then change it using Forgot password.", "Sign in to MerchPortal", "{{login_url}}", "Email: {{client_email}}\nTemporary password: {{temporary_password}}"),
    variables: ["first_name", "client_email", "temporary_password", "login_url"], required: ["client_email", "temporary_password", "login_url"],
    sample: { first_name: "Alex", client_email: "client@example.com", temporary_password: "Example-password-not-valid", login_url: `${exampleUrl}/login` },
  },
  {
    id: "staff-quote-request", name: "New quote request", audience: "Staff notification mailbox",
    trigger: "A client submits a quote request, including product, printing and artwork details.",
    subject: "New MerchPortal quote request {{quote_id}}", html: staffHtml,
    variables: ["quote_id", "company_name", "contact_name", "contact_email", "phone", "vat_number", "billing_address", "delivery_address", "customer_note", "item_count", "quote_items_html", "review_url"],
    required: ["quote_id", "contact_email", "quote_items_html", "review_url"],
    sample: {
      quote_id: "quote_example_001", company_name: "Example Company Ltd", contact_name: "Alex Borg", contact_email: "client@example.com",
      phone: "+356 2123 4567", vat_number: "MT12345678", billing_address: "1 Example Street, Valletta, Malta", delivery_address: "2 Example Road, Marsa, Malta",
      customer_note: "Please confirm availability and delivery timing.", item_count: "1", review_url: "https://example.com/app/merchportal/quotes",
      quote_items_html: `<section style="border:1px solid #dce6f0;border-radius:12px;padding:16px;margin:14px 0"><strong style="font-size:17px">Example cotton tote bag</strong><p style="color:#52657a">Blue · Standard · EXAMPLE-01 · 100 units</p><p><strong>Screen printing · Front</strong><br>100 × 80 mm · 1 colour</p><p><strong>Artwork files · 1</strong><br><a href="https://example.com/admin/merchportal/artwork/example?file=0">Download example-logo.pdf</a><br><small>Staff sign-in required</small></p></section>`,
    },
  },
  {
    id: "client-quote-ready", name: "Quote ready", audience: "Client",
    trigger: "Staff finalises a quote in MerchPortal.",
    subject: "Your MerchPortal quote {{quote_id}} is ready",
    html: transactionalEmailHtml("Your quote is ready", "Your final quote {{quote_id}} is €{{final_total}} excluding VAT. Open your quotes to review it.", "View your quotes", "{{quotes_url}}", "{{staff_note}}"),
    variables: ["quote_id", "final_total", "quotes_url", "staff_note"], required: ["quote_id", "final_total", "quotes_url"],
    sample: { quote_id: "quote_example_001", final_total: "325.00", quotes_url: `${exampleUrl}/account/quotes`, staff_note: "Thank you. Your quote includes the selected printing." },
  },
  {
    id: "smtp-test", name: "Email connection test", audience: "Staff notification mailbox",
    trigger: "An administrator tests the Zoho SMTP connection in Settings.",
    subject: "MerchPortal email test",
    html: transactionalEmailHtml("Email is connected", "MerchPortal is connected to your Zoho mailbox. Quote notifications are ready.", "Open MerchPortal", "{{portal_url}}"),
    variables: ["portal_url"], required: ["portal_url"], sample: { portal_url: exampleUrl },
  },
]

function definitionFor(id: string): Definition {
  const definition = emailTemplateDefinitions.find((template) => template.id === id)
  if (!definition) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Email template not found")
  return definition
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] || character)
}

export function validateEmailTemplate(id: string, input: Record<string, unknown>): TemplateContent {
  const definition = definitionFor(id)
  const subject = typeof input.subject === "string" ? input.subject.trim() : ""
  const html = typeof input.html === "string" ? input.html.trim() : ""
  if (!subject || subject.length > 200 || /[\r\n]/u.test(subject)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a subject of 1–200 characters without line breaks")
  if (!html || Buffer.byteLength(html, "utf8") > 100_000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter email HTML up to 100 KB")
  if (/<\s*(script|iframe|object|embed|form|base)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:/iu.test(html)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Email HTML cannot contain scripts, forms, embedded pages or event handlers")
  const tokens = (content: string) => {
    const names = [...content.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gu)].map((match) => match[1])
    const remaining = content.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gu, "")
    if (remaining.includes("{{") || remaining.includes("}}") || names.some((name) => !definition.variables.includes(name))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use only the listed {{variable_name}} placeholders")
    return names
  }
  if (tokens(subject).includes("quote_items_html")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Product HTML can only appear in the email body")
  const htmlTokens = tokens(html)
  const missing = definition.required.filter((name) => !htmlTokens.includes(name))
  if (missing.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Keep these required placeholders in the HTML: ${missing.map((name) => `{{${name}}}`).join(", ")}`)
  return { subject, html }
}

export function renderEmailTemplate(id: string, variables: Variables, content?: TemplateContent) {
  const definition = definitionFor(id)
  const template = content || definition
  const replace = (source: string, html: boolean) => source.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gu, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Missing email variable: ${name}`)
    const value = String(variables[name])
    return html && name !== "quote_items_html" ? escapeHtml(value) : value
  })
  return { subject: replace(template.subject, false).replace(/[\r\n]/gu, " ").slice(0, 998), html: replace(template.html, true) }
}

async function loadTemplate(service: any, id: string) {
  const definition = definitionFor(id)
  const [setting] = await service.listPortalSettings({ key: `email-template:${id}` }, { take: 1 })
  return { definition, setting, content: setting?.value?.html ? validateEmailTemplate(id, setting.value) : { subject: definition.subject, html: definition.html } }
}

export async function listEmailTemplates(service: any) {
  return Promise.all(emailTemplateDefinitions.map(async (definition) => {
    const { setting, content } = await loadTemplate(service, definition.id)
    return {
      id: definition.id, name: definition.name, audience: definition.audience, trigger: definition.trigger,
      ...content, default_subject: definition.subject, default_html: definition.html,
      variables: definition.variables, required: definition.required,
      customized: Boolean(setting?.value?.html), updated_at: setting?.value?.html ? setting.updated_at : null,
      preview: renderEmailTemplate(definition.id, definition.sample, content),
    }
  }))
}

export async function saveEmailTemplate(service: any, id: string, input: Record<string, unknown>, actorId: string) {
  definitionFor(id)
  const value = input.reset === true ? {} : { ...validateEmailTemplate(id, input), updated_by: actorId }
  const key = `email-template:${id}`
  const [setting] = await service.listPortalSettings({ key }, { take: 1 })
  if (setting) await service.updatePortalSettings({ id: setting.id, value })
  else await service.createPortalSettings({ key, value })
}

export function previewEmailTemplate(id: string, input: Record<string, unknown>) {
  const definition = definitionFor(id)
  return renderEmailTemplate(id, definition.sample, validateEmailTemplate(id, input))
}

export async function sendTemplatedPortalEmail(service: any, id: EmailTemplateId, recipient: string, variables: Variables, plainText: string, test = false) {
  let accepted: boolean
  try {
    const { content } = await loadTemplate(service, id)
    const email = renderEmailTemplate(id, variables, content)
    accepted = await sendPortalEmail(service, recipient, email.subject, plainText, test, email.html)
  } catch (error) {
    await recordEmailDelivery(service, id, recipient, "failed", emailFailureCode(error))
    throw error
  }
  await recordEmailDelivery(service, id, recipient, accepted ? "accepted" : "failed", accepted ? undefined : "SMTP_NOT_ACCEPTED")
  return accepted
}
