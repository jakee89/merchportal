import { PasswordForm } from "../password-form"
import styles from "../../portal-shell.module.css"

export const metadata = { title: "Set password | MerchPortal", robots: { index: false } }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  const { email, token } = await searchParams
  return <main className={styles.page}><div className={styles.profileWidth}><PasswordForm email={email || ""} token={token || ""} /></div></main>
}
