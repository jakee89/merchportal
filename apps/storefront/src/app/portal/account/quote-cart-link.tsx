import Link from "next/link"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import styles from "../../portal-shell.module.css"

export default async function QuoteCartLink() {
  let count = 0
  try {
    const summary = await sdk.client.fetch<{ cart_count: number }>("/portal-api/quotes?summary=true", { headers: await getAuthHeaders(), cache: "no-store" })
    count = summary.cart_count
  } catch {}
  return <Link className={styles.cartHeaderLink} href="/portal/account/quotes">Quote cart{count > 0 && <span className={styles.cartBadge} aria-label={`${count} products in quote cart`}>{count}</span>}</Link>
}
