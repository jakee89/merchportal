"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import styles from "../../../portal-shell.module.css"
import { removeQuoteItem, submitQuote } from "./actions"
import type { Quote, QuoteItem } from "./page"

function Item({ item, remove }: { item: QuoteItem; remove?: (id: string) => void }) {
  return <article className={styles.quoteItem}>
    <div><Link href={`/portal/account/products/${item.product_id}`}><strong>{item.product_name}</strong></Link><p>{item.color} · {item.quantity.toLocaleString()} units</p>{item.decorations.map((line, index) => <small key={index}>{line.method_name} · {line.position_name}</small>)}{item.artwork_filename && <small>Artwork: {item.artwork_filename}</small>}</div>
    <div><strong>{item.quote_required || item.estimated_total === null ? "Quote required" : `€${item.estimated_total.toFixed(2)}`}</strong>{remove && <button type="button" onClick={() => remove(item.id)}>Remove</button>}</div>
  </article>
}

export default function QuoteCart({ cart, history }: { cart: Quote | null; history: Quote[] }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const remove = async (id: string) => { setBusy(true); setMessage(""); try { await removeQuoteItem(id); router.refresh() } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove item") } finally { setBusy(false) } }
  const submit = async () => { setBusy(true); setMessage(""); try { await submitQuote(note); setNote(""); setMessage("Quote request sent to staff."); router.refresh() } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send quote request") } finally { setBusy(false) } }
  return <div className={styles.quoteLayout}>
    <section className={styles.quotePanel}><h2>Your cart · {cart?.items.length || 0} products</h2>{cart?.items.length ? <>{cart.items.map((item) => <Item key={item.id} item={item} remove={busy ? undefined : remove} />)}<label>Notes for our team<textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Delivery date, branding details or anything we should know" /></label><div className={styles.quoteTotal}><span>Estimated total</span><strong>{cart.estimated_total === null ? "Quote required" : `€${cart.estimated_total.toFixed(2)}`}</strong></div><p className={styles.helper}>Prices exclude VAT. Staff will confirm the final amount before any order is placed.</p><button className={styles.primary} type="button" disabled={busy} onClick={submit}>{busy ? "Working…" : "Request final quote"}</button></> : <p>Your cart is empty. <Link href="/portal/account">Browse products →</Link></p>}{message && <p className={styles.configMessage} aria-live="polite">{message}</p>}</section>
    <section className={styles.quotePanel}><h2>Previous requests</h2>{history.length ? history.map((quote) => <article className={styles.quoteHistory} key={quote.id}><strong>{quote.status === "quoted" ? "Final quote ready" : "Awaiting staff response"}</strong><span>{new Date(quote.created_at).toLocaleDateString()} · {quote.items.length} products</span><span>{quote.final_total !== null && quote.final_total !== undefined ? `Final price €${quote.final_total.toFixed(2)}` : quote.estimated_total === null ? "Quote required" : `Estimate €${quote.estimated_total.toFixed(2)}`}</span>{quote.staff_note && <p>{quote.staff_note}</p>}<details><summary>Products</summary>{quote.items.map((item) => <Item key={item.id} item={item} />)}</details></article>) : <p>No requests yet.</p>}</section>
  </div>
}
