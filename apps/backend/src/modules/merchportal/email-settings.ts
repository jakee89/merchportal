import nodemailer from "nodemailer"
import { MedusaError } from "@medusajs/framework/utils"
import { decryptStoredSecret, encryptStoredSecret } from "./secret-crypto"

const allowedHosts = new Set(["smtp.zoho.eu", "smtppro.zoho.eu"])

type EmailSettings = {
  host: string
  port: 465 | 587
  username: string
  from_email: string
  notification_email: string
  encrypted_password?: string
  verified?: boolean
}

export async function loadEmailSettings(service: any): Promise<EmailSettings | null> {
  const [setting] = await service.listPortalSettings({ key: "email" }, { take: 1 })
  return setting?.value || null
}

export function publicEmailSettings(settings: EmailSettings | null) {
  return {
    host: settings?.host || "smtppro.zoho.eu",
    port: settings?.port || 587,
    username: settings?.username || "",
    from_email: settings?.from_email || "",
    notification_email: settings?.notification_email || "",
    password_configured: Boolean(settings?.encrypted_password),
    verified: Boolean(settings?.verified),
  }
}

export async function saveEmailSettings(service: any, input: Record<string, unknown>) {
  const existing = await loadEmailSettings(service)
  const host = String(input.host || "smtppro.zoho.eu").trim().toLowerCase()
  const port = Number(input.port || 587)
  const username = String(input.username || "").trim()
  const fromEmail = String(input.from_email || "").trim()
  const notificationEmail = String(input.notification_email || "").trim()
  const password = typeof input.app_password === "string" ? input.app_password.trim() : ""
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254

  if (!allowedHosts.has(host) || (port !== 465 && port !== 587)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use a Zoho EU SMTP host and port 465 or 587")
  }
  if (!isEmail(username) || !isEmail(fromEmail) || !isEmail(notificationEmail)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid Zoho login, sender and staff notification email addresses")
  }
  if (!password && !existing?.encrypted_password) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a Zoho app password")
  }
  if (password.length > 4096) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The app password is too long")
  }

  const value: EmailSettings = {
    host,
    port: port as 465 | 587,
    username,
    from_email: fromEmail,
    notification_email: notificationEmail,
    encrypted_password: password ? encryptStoredSecret("email:zoho", password) : existing?.encrypted_password,
    verified: false,
  }
  const [setting] = await service.listPortalSettings({ key: "email" }, { take: 1 })
  if (setting) await service.updatePortalSettings({ id: setting.id, value })
  else await service.createPortalSettings({ key: "email", value })
  return publicEmailSettings(value)
}

export async function markEmailSettingsVerified(service: any) {
  const [setting] = await service.listPortalSettings({ key: "email" }, { take: 1 })
  if (setting) await service.updatePortalSettings({ id: setting.id, value: { ...setting.value, verified: true } })
}

export async function sendPortalEmail(service: any, recipient: string, subject: string, message: string, test = false) {
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password || (!test && !settings.verified)) return false
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port === 587,
    auth: { user: settings.username, pass: decryptStoredSecret("email:zoho", settings.encrypted_password) },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  })
  await transport.sendMail({ from: settings.from_email, to: recipient, subject, text: message })
  return true
}
