import Link from "next/link"
import AuthForm from "./auth-form"
import styles from "../../portal-shell.module.css"

type PortalStatus = {
  status: "ok"
  operations: Array<{
    kind: string
    phase: string
    progress_percent: number
  }>
}

async function getPortalStatus() {
  const backend =
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  try {
    const response = await fetch(`${backend}/portal-status`, {
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as PortalStatus
  } catch {
    return null
  }
}

export default async function PortalLoginPage() {
  const portalStatus = await getPortalStatus()
  const operation = portalStatus?.operations[0]
  return <div className={styles.page}><header className={styles.topbar}><Link href="/portal" className={styles.brand}><span className={styles.mark}>M</span>MerchPortal</Link></header><main className={styles.authPage}><div><span className={styles.eyebrow}>Client access</span><h1>Your company catalog</h1><p>Sign in with your client account. New clients need the company code supplied by your account manager.</p><p className={styles.serviceStatus} aria-live="polite">{!portalStatus ? "Portal service is unavailable. Please try again shortly." : operation ? `Catalog update in progress: ${operation.kind} (${operation.phase}, ${operation.progress_percent}%).` : "Portal service is online."}</p></div><AuthForm /></main></div>
}
