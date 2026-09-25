"use client"

import Link from "next/link"
import { useActionState } from "react"
import { requestPasswordReset, setNewPassword } from "./password-actions"
import styles from "../portal-shell.module.css"

export function PasswordForm({ email = "", token }: { email?: string; token?: string }) {
  const [state, action, pending] = useActionState(token ? setNewPassword : requestPasswordReset, null)
  return <div className={styles.authCard}>
    <h1>{token ? "Set a new password" : "Forgot your password?"}</h1>
    <p className={styles.helper}>{token ? "Choose a new password for your MerchPortal account." : "Enter your account email and we’ll send you a secure reset link."}</p>
    <form className={styles.authForm} action={action}>
      <label>Email<input name="email" type="email" defaultValue={email} required autoComplete="email" readOnly={Boolean(token)} /></label>
      {token && <><input name="token" type="hidden" value={token} /><label>New password<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label><label>Confirm new password<input name="confirmation" type="password" minLength={12} required autoComplete="new-password" /></label></>}
      {state && <p className={state.status === "error" ? styles.error : styles.notice} role="status">{state.message}</p>}
      <button className={styles.primary} disabled={pending}>{pending ? "Please wait…" : token ? "Update password" : "Email reset link"}</button>
    </form>
    <p className={styles.helper}><Link href="/portal/login">Back to sign in</Link></p>
  </div>
}
