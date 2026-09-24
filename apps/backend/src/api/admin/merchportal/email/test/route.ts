import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../modules/merchportal"
import { loadEmailSettings, markEmailSettingsVerified, sendPortalEmail } from "../../../../../modules/merchportal/email-settings"
import { requireStaff } from "../../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") {
    res.status(403).json({ message: "Only a super administrator can test email settings" })
    return
  }
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) {
    res.status(400).json({ message: "Save the Zoho app password first" })
    return
  }
  try {
    await sendPortalEmail(service, settings.notification_email, "MerchPortal email test", "MerchPortal is connected to your Zoho mailbox. Quote notifications are ready.", true)
    await markEmailSettingsVerified(service)
    res.json({ sent: true, recipient: settings.notification_email })
  } catch {
    res.status(502).json({ message: "Zoho could not send the test email. Check the mailbox, app password, SMTP host and port." })
  }
}
