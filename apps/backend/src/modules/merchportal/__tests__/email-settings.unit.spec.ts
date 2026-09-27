import { loadEmailSettings, publicEmailSettings, saveEmailSettings, sendPortalEmail } from "../email-settings"
import { transactionalEmailHtml } from "../transactional-email"

describe("Zoho email settings", () => {
  const originalSecret = process.env.JWT_SECRET

  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-for-email-settings"
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  })

  function service() {
    let setting: any
    return {
      listPortalSettings: jest.fn(async () => setting ? [setting] : []),
      createPortalSettings: jest.fn(async (input: any) => { setting = { id: "setting-1", ...input }; return setting }),
      updatePortalSettings: jest.fn(async (input: any) => { setting = { ...setting, ...input }; return setting }),
    }
  }

  it("stores the app password encrypted and never returns it to Admin", async () => {
    const store = service()
    const input = { host: "smtppro.zoho.eu", port: 465, username: "info@example.com", from_email: "info@example.com", notification_email: "staff@example.com", app_password: "zoho-app-password" }
    const result = await saveEmailSettings(store, input)
    expect(result.password_configured).toBe(true)
    expect(result.transactional_from_email).toBe("noreply@customislandgifts.mt")
    expect(JSON.stringify(result)).not.toContain("zoho-app-password")
    const saved = await loadEmailSettings(store)
    expect(saved?.encrypted_password).toBeTruthy()
    expect(saved?.encrypted_password).not.toContain("zoho-app-password")
    expect(JSON.stringify(publicEmailSettings(saved))).not.toContain("encrypted_password")
    expect(result.verified).toBe(false)
    expect(await sendPortalEmail(store, "staff@example.com", "Test", "Test")).toBe(false)

    await saveEmailSettings(store, { ...input, app_password: "" })
    expect((await loadEmailSettings(store))?.encrypted_password).toBe(saved?.encrypted_password)
  })

  it("rejects non-Zoho hosts and missing credentials", async () => {
    const store = service()
    const input = { host: "localhost", port: 465, username: "info@example.com", from_email: "info@example.com", notification_email: "staff@example.com", app_password: "password" }
    await expect(saveEmailSettings(store, input)).rejects.toThrow()
    await expect(saveEmailSettings(store, { ...input, host: "smtp.zoho.eu", app_password: "" })).rejects.toThrow()
  })

  it("escapes client data and links in transactional email HTML", () => {
    const html = transactionalEmailHtml("Welcome", "Hello <Client>", "Sign in", "https://example.com/?a=1&b=2", "Password: <secret>")
    expect(html).toContain("Hello &lt;Client&gt;")
    expect(html).toContain("Password: &lt;secret&gt;")
    expect(html).toContain("href=\"https://example.com/?a=1&amp;b=2\"")
    expect(html).not.toContain("<secret>")
  })
})
