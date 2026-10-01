import { emailTemplateDefinitions, listEmailTemplates, previewEmailTemplate, renderEmailTemplate, saveEmailTemplate, sendTemplatedPortalEmail, validateEmailTemplate } from "../email-templates"
import { sendPortalEmail } from "../email-settings"
import { requireStaff } from "../../../api/admin/merchportal/auth"
import { GET as listRoute } from "../../../api/admin/merchportal/email-templates/route"
import { POST as saveRoute } from "../../../api/admin/merchportal/email-templates/[id]/route"
import { POST as previewRoute } from "../../../api/admin/merchportal/email-templates/[id]/preview/route"

jest.mock("../email-settings", () => ({ sendPortalEmail: jest.fn(async () => true) }))
jest.mock("../../../api/admin/merchportal/auth", () => ({ requireStaff: jest.fn() }))

function store() {
  const settings = new Map<string, any>()
  return {
    listPortalSettings: jest.fn(async ({ key }: { key: string }) => settings.has(key) ? [settings.get(key)] : []),
    createPortalSettings: jest.fn(async (input: any) => {
      const setting = { id: input.key, ...input, updated_at: "2026-10-01T12:00:00Z" }
      settings.set(input.key, setting)
      return setting
    }),
    updatePortalSettings: jest.fn(async (input: any) => {
      const setting = { ...settings.get(input.id), ...input }
      settings.set(input.id, setting)
      return setting
    }),
  }
}

describe("editable portal email templates", () => {
  beforeEach(() => jest.clearAllMocks())

  it("lists all five email types with fictional previews and no SMTP secrets", async () => {
    const templates = await listEmailTemplates(store())
    expect(templates.map((template) => template.id)).toEqual(emailTemplateDefinitions.map((definition) => definition.id))
    expect(templates).toHaveLength(5)
    for (const template of templates) {
      expect(template.customized).toBe(false)
      expect(template.preview.html).not.toMatch(/\{\{.*?\}\}/u)
      expect(template.preview.subject).not.toMatch(/\{\{.*?\}\}/u)
      expect(template.preview.html).toContain("<html")
    }
    expect(sendPortalEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(templates)).not.toContain("encrypted_password")
  })

  it.each(emailTemplateDefinitions)("validates default $id and renders its sample", (definition) => {
    expect(validateEmailTemplate(definition.id, definition)).toEqual({ subject: definition.subject, html: definition.html })
    expect(previewEmailTemplate(definition.id, definition).html).not.toContain("{{")
  })

  it("persists edits without changing other templates, and restores the default", async () => {
    const service = store()
    const custom = { subject: "Custom reset", html: '<h1>Custom Island Gifts</h1><a href="{{reset_url}}">Choose a password</a>' }
    await saveEmailTemplate(service, "password-reset", custom, "admin-1")
    let templates = await listEmailTemplates(service)
    expect(templates[0]).toMatchObject({ ...custom, customized: true })
    expect(templates[1].customized).toBe(false)
    expect(service.createPortalSettings).toHaveBeenCalledWith(expect.objectContaining({ value: { ...custom, updated_by: "admin-1" } }))
    await saveEmailTemplate(service, "password-reset", { reset: true }, "admin-1")
    templates = await listEmailTemplates(service)
    expect(templates[0].customized).toBe(false)
    expect(templates[0].html).toBe(emailTemplateDefinitions[0].html)
    expect(service.updatePortalSettings).toHaveBeenCalledTimes(1)
  })

  it("uses the saved subject and HTML in a real send, preserving recipient and plaintext", async () => {
    const service = store()
    await saveEmailTemplate(service, "password-reset", { subject: "Account help for {{client_email}}", html: '<p>Custom branding</p><a href="{{reset_url}}">Reset</a>' }, "admin-1")
    const resetUrl = "https://example.com/reset?email=client@example.com&token=real-token"
    expect(await sendTemplatedPortalEmail(service, "password-reset", "client@example.com", { reset_url: resetUrl, client_email: "client@example.com" }, `Reset: ${resetUrl}`)).toBe(true)
    expect(sendPortalEmail).toHaveBeenCalledWith(service, "client@example.com", "Account help for client@example.com", `Reset: ${resetUrl}`, false, '<p>Custom branding</p><a href="https://example.com/reset?email=client@example.com&amp;token=real-token">Reset</a>')
  })

  it("escapes client data and does not recursively interpret placeholders in passwords", () => {
    const html = renderEmailTemplate("client-invitation", { first_name: '<img onerror="alert(1)">', client_email: "client@example.com", temporary_password: "abc{{first_name}}<&", login_url: "https://example.com/?a=1&b=2" }).html
    expect(html).toContain("&lt;img onerror=&quot;alert(1)&quot;&gt;")
    expect(html).toContain("abc{{first_name}}&lt;&amp;")
    expect(html).not.toContain("<img")
  })

  it("retains generated product HTML but escapes customer information around it", () => {
    const definition = emailTemplateDefinitions.find((definition) => definition.id === "staff-quote-request")!
    const html = renderEmailTemplate(definition.id, { ...definition.sample, company_name: "<script>bad</script>" }).html
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;")
    expect(html).toContain("<section")
    expect(html).toContain("example-logo.pdf")
  })

  it("rejects removed required fields, unknown tokens, malformed tokens and missing live values", () => {
    expect(() => validateEmailTemplate("password-reset", { subject: "Reset", html: "<p>No reset link</p>" })).toThrow("required placeholders")
    expect(() => validateEmailTemplate("password-reset", { subject: "{{secret}}", html: "{{reset_url}}" })).toThrow("listed")
    expect(() => validateEmailTemplate("password-reset", { subject: "Reset", html: "{{reset_url}} {{first_name" })).toThrow("listed")
    expect(() => renderEmailTemplate("password-reset", {})).toThrow("Missing email variable")
    expect(() => validateEmailTemplate("staff-quote-request", { subject: "{{quote_items_html}}", html: emailTemplateDefinitions[2].html })).toThrow("body")
  })

  it.each(["<script>alert(1)</script>", '<img onerror="alert(1)">', '<a href="javascript:alert(1)">Click</a>', '<iframe src="https://example.com"></iframe>', "<form></form>"])("rejects active template markup %s", (markup) => {
    expect(() => validateEmailTemplate("password-reset", { subject: "Reset", html: `{{reset_url}}${markup}` })).toThrow("cannot contain")
  })

  it("rejects unknown email IDs, oversized HTML and subject header injection", async () => {
    expect(() => previewEmailTemplate("unknown", {})).toThrow("not found")
    expect(() => validateEmailTemplate("password-reset", { subject: "Reset\r\nBcc: evil@example.com", html: "{{reset_url}}" })).toThrow("line breaks")
    expect(() => validateEmailTemplate("password-reset", { subject: "Reset", html: `{{reset_url}}${"x".repeat(100_000)}` })).toThrow("100 KB")
    const service = store()
    await expect(saveEmailTemplate(service, "unknown", { reset: true }, "admin-1")).rejects.toThrow("not found")
    expect(service.createPortalSettings).not.toHaveBeenCalled()
  })

  it("keeps preview non-persistent and SMTP test verification behaviour", async () => {
    const definition = emailTemplateDefinitions[4]
    const service = store()
    previewEmailTemplate(definition.id, definition)
    expect(service.createPortalSettings).not.toHaveBeenCalled()
    expect(sendPortalEmail).not.toHaveBeenCalled()
    await sendTemplatedPortalEmail(service, definition.id, "staff@example.com", { portal_url: "https://example.com" }, "Connection test", true)
    expect(sendPortalEmail).toHaveBeenCalledWith(service, "staff@example.com", definition.subject, "Connection test", true, expect.any(String))
  })

  it("blocks non-admin writes and permits staff read-only previews", async () => {
    jest.mocked(requireStaff).mockResolvedValue({ role: "sales_rep" } as any)
    const req = { params: { id: "password-reset" }, body: emailTemplateDefinitions[0], scope: { resolve: jest.fn() } } as any
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as any
    await saveRoute(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(req.scope.resolve).not.toHaveBeenCalled()
    await previewRoute(req, res)
    expect(res.json).toHaveBeenLastCalledWith({ preview: expect.objectContaining({ html: expect.any(String) }) })
    req.scope.resolve.mockReturnValue(store())
    await listRoute(req, res)
    expect(res.json).toHaveBeenLastCalledWith({ templates: expect.any(Array), can_edit: false })
  })

  it("allows a super admin to save with the authenticated actor and denies unauthenticated access", async () => {
    const service = store()
    const req = { params: { id: "password-reset" }, body: emailTemplateDefinitions[0], scope: { resolve: jest.fn(() => service) }, auth_context: { actor_id: "admin-1" } } as any
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as any
    jest.mocked(requireStaff).mockResolvedValue({ role: "super_admin" } as any)
    await saveRoute(req, res)
    expect(res.json).toHaveBeenCalledWith({ saved: true })
    expect(service.createPortalSettings).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ updated_by: "admin-1" }) }))
    jest.mocked(requireStaff).mockRejectedValue(new Error("Sign in required"))
    await expect(listRoute(req, res)).rejects.toThrow("Sign in required")
    await expect(previewRoute(req, res)).rejects.toThrow("Sign in required")
    await expect(saveRoute(req, res)).rejects.toThrow("Sign in required")
  })
})
