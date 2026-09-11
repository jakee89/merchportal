import Link from "next/link"
import AuthForm from "./auth-form"
import styles from "../../portal-shell.module.css"

export default function PortalLoginPage() {
  return <div className={styles.page}><header className={styles.topbar}><Link href="/portal" className={styles.brand}><span className={styles.mark}>M</span>MerchPortal</Link></header><main className={styles.authPage}><div><span className={styles.eyebrow}>Client access</span><h1>Your company catalog</h1><p>Sign in with your client account. New clients need the company code supplied by your account manager.</p></div><AuthForm /></main></div>
}
