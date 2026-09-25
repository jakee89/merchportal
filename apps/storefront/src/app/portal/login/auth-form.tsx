"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { portalLogin, portalSignup } from "../actions"
import styles from "../../portal-shell.module.css"

export default function AuthForm() {
  const [registering, setRegistering] = useState(false)
  const [sameDelivery, setSameDelivery] = useState(true)
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
      {registering && <><div className={styles.formRow}><label>Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={40} /></label><label>Company name<input name="portal_company_name" required maxLength={160} /></label></div><label>VAT number (if registered)<input name="portal_vat_number" maxLength={50} /></label><h3>Billing address</h3><label>Street address<input name="portal_billing_line1" required maxLength={160} autoComplete="billing street-address" /></label><label>Address line 2 (optional)<input name="portal_billing_line2" maxLength={160} /></label><div className={styles.formRow}><label>City<input name="portal_billing_city" required maxLength={100} /></label><label>Postcode<input name="portal_billing_postal_code" required maxLength={24} /></label></div><label>Country code<input name="portal_billing_country_code" defaultValue="MT" required maxLength={2} aria-label="Billing country two-letter code" /></label><label className={styles.checkboxLabel}><input type="checkbox" name="portal_same_delivery" checked={sameDelivery} onChange={(event) => setSameDelivery(event.target.checked)} />Delivery address is the same as billing</label>{!sameDelivery && <><h3>Delivery address</h3><label>Street address<input name="portal_delivery_line1" required maxLength={160} /></label><label>Address line 2 (optional)<input name="portal_delivery_line2" maxLength={160} /></label><div className={styles.formRow}><label>City<input name="portal_delivery_city" required maxLength={100} /></label><label>Postcode<input name="portal_delivery_postal_code" required maxLength={24} /></label></div><label>Country code<input name="portal_delivery_country_code" defaultValue="MT" required maxLength={2} aria-label="Delivery country two-letter code" /></label></>}</>}
      <label>Password<input name="password" type="password" minLength={registering ? 12 : 8} required autoComplete={registering ? "new-password" : "current-password"} /></label>
      <label>Company code {registering ? "" : "(only needed the first time)"}<input name="join_code" required={registering} autoCapitalize="characters" /></label>
      {state?.state === "error" && <p className={styles.error}>{state.error}</p>}
      {state?.state === "verification_required" && <p className={styles.notice}>Check {state.email} to verify your account.</p>}
      <button className={styles.primary} disabled={pending} aria-busy={pending}>{pending ? (registering ? "Creating account…" : "Signing in…") : registering ? "Create client account" : "Sign in"}</button>
    </form>
    {!registering && <p className={styles.helper}><Link href="/portal/forgot-password">Forgot password?</Link></p>}
  </div>
}
