import { MedusaError } from "@medusajs/framework/utils"

export async function loadPortalBranding(service: any) {
  const [setting] = await service.listPortalSettings({ key: "branding" }, { take: 1 })
  return { logo_url: typeof setting?.value?.logo_url === "string" ? setting.value.logo_url : "" }
}

export async function savePortalBranding(service: any, input: Record<string, unknown>) {
  const logo = typeof input.logo_url === "string" ? input.logo_url.trim() : ""
  if (logo) {
    let valid = false
    try {
      const url = new URL(logo)
      valid = url.protocol === "https:" && !url.username && !url.password && logo.length <= 2048
    } catch {}
    if (!valid) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a public HTTPS logo image URL without login credentials")
  }
  const [setting] = await service.listPortalSettings({ key: "branding" }, { take: 1 })
  const value = { logo_url: logo }
  if (setting) await service.updatePortalSettings({ id: setting.id, value })
  else await service.createPortalSettings({ key: "branding", value })
  return value
}
