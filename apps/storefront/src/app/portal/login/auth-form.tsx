"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import CountrySelect from "../country-select"
import { portalLogin, portalSignup } from "../actions"
import styles from "../../portal-shell.module.css"

export default function AuthForm({ returnTo }: { returnTo?: string }) {
  const [registering, setRegistering] = useState(false)
  const [sameDelivery, setSameDelivery] = useState(true)
  const [billingCountry, setBillingCountry] = useState("mt")
  const [deliveryCountry, setDeliveryCountry] = useState("mt")
  const [loginState, loginAction, loginPending] = useActionState(portalLogin, null)
  const [signupState, signupAction, signupPending] = useActionState(portalSignup, null)
  const state = registering ? signupState : loginState
  const pending = registering ? signupPending : loginPending

  return <div className={styles.authCard}>
    <div className={styles.tabs} role="group" aria-label="Account access">
      <button type="button" className={!registering ? styles.activeTab : ""} onClick={() => setRegistering(false)}>Sign in</button>
      <button type="button" className={registering ? styles.activeTab : ""} onClick={() => setRegistering(true)}>Register</button>
    </div>
    <form action={registering ? signupAction : loginAction} className={styles.authForm}>
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {registering && <div className={styles.formRow}><label>First name<input name="first_name" required autoComplete="given-name" maxLength={60} /></label><label>Last name<input name="last_name" required autoComplete="family-name" maxLength={60} /></label></div>}
      <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
      {registering && <>
        <div className={styles.formRow}><label>Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={40} /></label><label>Company name<input name="portal_company_name" required maxLength={160} /></label></div>
        <label>VAT number <span className={styles.optional}>(if registered)</span><input name="portal_vat_number" maxLength={50} /></label>
        <section className={styles.authSection}><h2>Billing address</h2><label>Street address<input name="portal_billing_line1" required maxLength={160} autoComplete="street-address" /></label><label>Address line 2 <span className={styles.optional}>(optional)</span><input name="portal_billing_line2" maxLength={160} /></label><div className={styles.formRow}><label>City<input name="portal_billing_city" required maxLength={100} /></label><label>Postal code<input name="portal_billing_postal_code" required maxLength={24} /></label></div><label>Country<CountrySelect name="portal_billing_country_code" value={billingCountry} onChange={setBillingCountry} /></label></section>
        <label className={styles.checkboxLabel}><input type="checkbox" name="portal_same_delivery" checked={sameDelivery} onChange={(event) => setSameDelivery(event.target.checked)} />Delivery address is the same as billing</label>
        {!sameDelivery && <section className={styles.authSection}><h2>Delivery address</h2><label>Street address<input name="portal_delivery_line1" required maxLength={160} /></label><label>Address line 2 <span className={styles.optional}>(optional)</span><input name="portal_delivery_line2" maxLength={160} /></label><div className={styles.formRow}><label>City<input name="portal_delivery_city" required maxLength={100} /></label><label>Postal code<input name="portal_delivery_postal_code" required maxLength={24} /></label></div><label>Country<CountrySelect name="portal_delivery_country_code" value={deliveryCountry} onChange={setDeliveryCountry} /></label></section>}
      </>}
      <label>Password<input name="password" type="password" minLength={registering ? 12 : 8} required autoComplete={registering ? "new-password" : "current-password"} /></label>
      {registering && <label>Company code <span className={styles.optional}>(optional, if your company already has an account)</span><input name="join_code" autoCapitalize="characters" /></label>}
      {state?.state === "error" && <p className={styles.error} role="alert">{state.error}</p>}
      {state?.state === "verification_required" && <p className={styles.notice} role="status">Check {state.email} to verify your account.</p>}
      <button className={styles.primary} disabled={pending} aria-busy={pending}>{pending ? (registering ? "Creating account…" : "Signing in…") : registering ? "Create client account" : "Sign in"}</button>
    </form>
    {!registering && <p className={styles.authFooter}><Link href="/portal/forgot-password">Forgot password?</Link></p>}
  </div>
}
