import Link from "next/link"
import { cache } from "react"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import styles from "../portal-shell.module.css"

type PortalIdentity = {
  membership: { role: string } | null
  organization: { name: string; primary_color: string; logo_url?: string } | null
  branding?: { logo_url: string }
}

// Request-scoped deduplication only: never share identity or branding across clients.
export const getPortalIdentity = cache(async (): Promise<PortalIdentity | null> => {
  const headers = await getAuthHeaders()
  if (!headers.authorization) return null
  try {
    return await sdk.client.fetch<PortalIdentity>("/portal-api/me", { headers, cache: "no-store" })
  } catch (error) {
    const failed = error as { status?: number; statusCode?: number; response?: { status?: number } }
    const status = failed.status ?? failed.statusCode ?? failed.response?.status
    if (status === 401 || status === 403) return null
    throw error
  }
})

export function accountDestination(returnTo?: string) {
  if (!returnTo || /[\\\r\n]/.test(returnTo)) return "/portal/account"
  try {
    const url = new URL(returnTo, "https://portal.invalid")
    if (returnTo.startsWith("/") && url.origin === "https://portal.invalid" && /^\/portal\/account(?:\/|$)/.test(url.pathname)) return `${url.pathname}${url.search}${url.hash}`
  } catch {}
  return "/portal/account"
}

export default async function PortalBrand({ name = "MerchPortal" }: { name?: string }) {
  const identity = await getPortalIdentity()
  const logo = identity?.branding?.logo_url || identity?.organization?.logo_url || ""
  return <Link href="/portal/account" className={styles.brand}>
    {logo.startsWith("https://") ? <img src={logo} width={34} height={34} className={styles.brandLogo} referrerPolicy="no-referrer" alt="Portal logo" /> : <span className={styles.mark}>M</span>}
    {name}
  </Link>
}
