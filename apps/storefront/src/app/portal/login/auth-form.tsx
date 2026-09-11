"use client"

import { useActionState, useState } from "react"
import { portalLogin, portalSignup } from "../actions"
import styles from "../../portal-shell.module.css"

export default function AuthForm() {
  const [registering, setRegistering] = useState(false)
  const [loginState, loginAction, loginPending] = useActionState(portalLogin, null)
  const [signupState, signupAction, signupPending] = useActionState(portalSignup, null)
  const state = registering ? signupState : loginState
  const pending = registering ? signupPending : loginPending
  return <div className={styles.authCard}>
    <div className={styles.tabs}>
      <button type="button" className={!registering ? styles.activeTab : ""} onClick={() => setRegistering(false)}>Sign in</button>
      <button type="button" className={registering ? styles.activeTab : ""} onClick={() => setRegistering(true)}>Create account</button>
    </div>
    <form action={registering ? signupAction : loginAction} className={styles.authForm}>
      {registering && <div className={styles.formRow}><label>First name<input name="first_name" required /></label><label>Last name<input name="last_name" required /></label></div>}
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Password<input name="password" type="password" minLength={8} required autoComplete={registering ? "new-password" : "current-password"} /></label>
      <label>Company code {registering ? "" : "(only needed the first time)"}<input name="join_code" required={registering} autoCapitalize="characters" /></label>
      {state?.state === "error" && <p className={styles.error}>{state.error}</p>}
      {state?.state === "verification_required" && <p className={styles.notice}>Check {state.email} to verify your account.</p>}
      <button className={styles.primary} disabled={pending} aria-busy={pending}>{pending ? (registering ? "Creating account…" : "Signing in…") : registering ? "Create client account" : "Sign in"}</button>
    </form>
  </div>
}
