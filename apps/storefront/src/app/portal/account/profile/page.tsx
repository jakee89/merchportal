import Link from "next/link"
import { redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import styles from "../../../portal-shell.module.css"
import type { QuoteDetails } from "../quotes/page"
import ProfileForm from "./profile-form"

export default async function ProfilePage() {
  if (!(await retrieveCustomer())) redirect("/portal/login")
  const { profile } = await sdk.client.fetch<{ profile: QuoteDetails }>("/portal-api/profile", { headers: await getAuthHeaders(), cache: "no-store" })
  return <div className={styles.page}><header className={styles.topbar}><Link className={styles.brand} href="/portal/account"><span className={styles.mark}>M</span>MerchPortal</Link><Link className={styles.secondary} href="/portal/account/quotes">Quote cart →</Link></header><main className={styles.productMain}><h1>Your business profile</h1><p className={styles.helper}>Save your contact, VAT, billing and delivery details once. New quote requests will use the saved profile.</p><div className={styles.profileWidth}><ProfileForm initial={profile} /></div></main></div>
}
