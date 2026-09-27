import Link from "next/link"
import AuthForm from "./auth-form"
import styles from "../../portal-shell.module.css"

export const metadata = { title: "Client sign in | MerchPortal", robots: { index: false } }

export default function PortalLoginPage() {
  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/portal/login" className={styles.brand}><span className={styles.mark}>M</span>MerchPortal</Link></header>
    <main className={styles.authPage}>
      <div className={styles.authIntro}><span className={styles.eyebrow}>Custom Island Gifts</span><h1>Welcome to MerchPortal</h1><p>Sign in to browse products and request a quote, or register your business to get started.</p></div>
      <AuthForm />
    </main>
  </div>
}
