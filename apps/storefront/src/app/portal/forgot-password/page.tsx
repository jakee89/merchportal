import { PasswordForm } from "../password-form"
import styles from "../../portal-shell.module.css"

export const metadata = { title: "Reset password | MerchPortal", robots: { index: false } }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams
  return <main className={styles.page}><div className={styles.profileWidth}><PasswordForm email={email || ""} /></div></main>
}
