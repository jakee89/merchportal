"use client"

import Link from "next/link"
import { useState } from "react"
import styles from "../../../portal-shell.module.css"
import type { QuoteDetails } from "../quotes/page"
import { saveProfile } from "./actions"

const addressFields = ["line1", "line2", "city", "postal_code", "country_code"] as const

export default function ProfileForm({ initial }: { initial: QuoteDetails }) {
  const [details, setDetails] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const change = (key: "contact_name" | "phone" | "company_name" | "vat_number", value: string) => setDetails((current) => ({ ...current, [key]: value }))
  const changeAddress = (kind: "billing_address" | "delivery_address", key: typeof addressFields[number], value: string) => setDetails((current) => ({ ...current, [kind]: { ...current[kind], [key]: value } }))
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const result = await saveProfile(details)
      setDetails(result.profile)
      setMessage("Profile saved. Future quote requests will use these details.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save profile") }
    finally { setBusy(false) }
  }
  return <form className={styles.quotePanel} onSubmit={submit}>
    <h2>Contact and company</h2>
    <div className={styles.quoteDetailsGrid}>
      <label>Contact name<input required maxLength={120} value={details.contact_name} onChange={(event) => change("contact_name", event.target.value)} /></label>
      <label>Email<input value={details.contact_email} readOnly aria-describedby="profile-email-note" /></label>
      <label>Phone<input required type="tel" maxLength={40} value={details.phone} onChange={(event) => change("phone", event.target.value)} /></label>
      <label>Company name<input required maxLength={160} value={details.company_name} onChange={(event) => change("company_name", event.target.value)} /></label>
      <label>VAT number (if registered)<input maxLength={50} value={details.vat_number} onChange={(event) => change("vat_number", event.target.value)} /></label>
    </div>
    <p className={styles.helper} id="profile-email-note">Your sign-in email is fixed to this account. Contact staff if it needs changing.</p>
    {(["billing_address", "delivery_address"] as const).map((kind) => <section key={kind}><h2>{kind === "billing_address" ? "Billing address" : "Delivery address"}</h2><div className={styles.quoteDetailsGrid}>{addressFields.map((key) => <label key={key}>{key === "line1" ? "Street address" : key === "line2" ? "Address line 2 (optional)" : key === "postal_code" ? "Postal code" : key === "country_code" ? "Two-letter country code" : "City"}<input required={key !== "line2"} maxLength={key === "country_code" ? 2 : key === "postal_code" ? 24 : key === "city" ? 100 : 160} value={details[kind][key]} onChange={(event) => changeAddress(kind, key, event.target.value)} /></label>)}</div></section>)}
    <button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    {message && <p className={styles.configMessage} role="status">{message}</p>}
    <p className={styles.helper}>Want to change your password? <Link href={`/portal/forgot-password?email=${encodeURIComponent(details.contact_email)}`}>Send me a reset link →</Link></p>
  </form>
}
