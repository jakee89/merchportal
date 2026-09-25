"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import styles from "../../../portal-shell.module.css"
import { removeQuoteItem, submitQuote } from "./actions"
import type { Quote, QuoteDetails, QuoteItem } from "./page"
import ProductImage from "../product-image"

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  if (value.startsWith("/media/")) return `/portal${value}`
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

function Item({ item, remove, backend }: { item: QuoteItem; remove?: (id: string) => void; backend: string }) {
  const files = item.artwork_files?.length ? item.artwork_files : item.artwork_url ? [{ filename: item.artwork_filename || "artwork", url: item.artwork_url }] : []
  return <article className={styles.quoteItem}>
    <Link className={styles.quoteProductImage} href={`/portal/account/products/${item.product_id}${item.sku ? `?sku=${encodeURIComponent(item.sku)}` : ""}`}><ProductImage src={mediaUrl(backend, item.image_url)} name={item.product_name} /></Link>
    <div className={styles.quoteItemDetails}><Link href={`/portal/account/products/${item.product_id}${item.sku ? `?sku=${encodeURIComponent(item.sku)}` : ""}`}><strong>{item.product_name}</strong></Link><p>{item.color}{item.variant_size ? ` · ${item.variant_size}` : ""}{item.sku ? ` · ${item.sku}` : ""} · {item.quantity.toLocaleString()} units</p>{item.variant_dimensions && <small>{item.variant_dimensions}</small>}{item.base_unit_price && <small>Plain product €{new Intl.NumberFormat("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(item.base_unit_price)} per unit</small>}{item.decorations.map((line, index) => <div className={styles.quoteDecoration} key={index}>{(line.position_image_url || item.image_url) && <ProductImage src={mediaUrl(backend, line.position_image_url)} fallbackSrc={mediaUrl(backend, item.image_url)} name={`${line.position_name} print guide`} />}<span><strong>{line.method_name} · {line.position_name}</strong><small>{[line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : line.max_width_mm && line.max_height_mm ? `Max ${line.max_width_mm} × ${line.max_height_mm} mm` : "", line.print_colours ? `${line.print_colours} print colour${line.print_colours === 1 ? "" : "s"}` : "", line.print_stitches ? `${line.print_stitches.toLocaleString()} stitches` : ""].filter(Boolean).join(" · ")}</small><small>{line.price_pending || line.unit_price_eur === null || line.unit_price_eur === undefined ? "Print price to confirm" : `€${new Intl.NumberFormat("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(line.unit_price_eur)} per unit${line.setup_price_eur ? ` + €${line.setup_price_eur.toFixed(2)} setup` : ""}`}</small></span></div>)}{files.length ? <div><strong>Artwork files · {files.length}</strong>{files.map((file, index) => <a className={styles.artworkLink} href={file.url} key={`${file.url}-${index}`}>Download {file.filename} ↓</a>)}</div> : <small>No artwork attached</small>}</div>
    <div><strong>{item.quote_required || item.estimated_total === null ? "Quote required" : `€${item.estimated_total.toFixed(2)}`}</strong>{remove && <button type="button" onClick={() => remove(item.id)}>Remove</button>}</div>
  </article>
}

export default function QuoteCart({ cart, history, buyerDetails, backend }: { cart: Quote | null; history: Quote[]; buyerDetails: QuoteDetails; backend: string }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const profileReady = Boolean(buyerDetails.contact_name && buyerDetails.contact_email && buyerDetails.phone && buyerDetails.company_name && [buyerDetails.billing_address, buyerDetails.delivery_address].every((address) => address.line1 && address.city && address.postal_code && /^[a-z]{2}$/i.test(address.country_code)))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const remove = async (id: string) => { setBusy(true); setMessage(""); try { await removeQuoteItem(id); router.refresh() } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove item") } finally { setBusy(false) } }
  const submit = async () => {
    if (!profileReady) {
      setMessage("Complete your business profile before requesting a quote")
      return
    }
    setBusy(true)
    setMessage("")
    try { const result = await submitQuote(note); setNote(""); setMessage(result.notification_sent ? "Quote request sent to staff." : "Quote request saved, but the email could not be sent. Staff can review it in the admin portal."); router.refresh() } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send quote request") } finally { setBusy(false) }
  }
  return <div className={styles.quoteLayout}>
    <section className={styles.quotePanel}><h2>Your cart · {cart?.items.length || 0} products</h2>{cart?.items.length ? <>{cart.items.map((item) => <Item key={item.id} item={item} backend={backend} remove={busy ? undefined : remove} />)}<div className={styles.quoteBusiness}><h3>Business profile</h3><p className={styles.helper}>{profileReady ? `${buyerDetails.company_name} · ${buyerDetails.contact_name} · ${buyerDetails.contact_email}` : "Complete your contact, billing and delivery details before requesting a quote."}</p><Link className={styles.artworkLink} href="/portal/account/profile">{profileReady ? "Review or edit profile →" : "Complete profile →"}</Link></div><label>Notes for our team<textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Delivery date, branding details or anything we should know" /></label><div className={styles.quoteTotal}><span>Estimated total</span><strong>{cart.estimated_total === null ? "Quote required" : `€${cart.estimated_total.toFixed(2)}`}</strong></div><p className={styles.helper}>Prices exclude VAT. Staff will confirm the final amount before any order is placed.</p><button className={styles.primary} type="button" disabled={busy || !profileReady} onClick={submit}>{busy ? "Working…" : "Request final quote"}</button></> : <p>Your cart is empty. <Link href="/portal/account">Browse products →</Link></p>}{message && <p className={styles.configMessage} aria-live="polite">{message}</p>}</section>
    <section className={styles.quotePanel}><h2>Previous requests</h2>{history.length ? history.map((quote) => <article className={styles.quoteHistory} key={quote.id}><strong>{quote.status === "quoted" ? "Final quote ready" : "Awaiting staff response"}</strong><span>{new Date(quote.created_at).toLocaleDateString()} · {quote.items.length} products</span><span>{quote.final_total !== null && quote.final_total !== undefined ? `Final price €${quote.final_total.toFixed(2)}` : quote.estimated_total === null ? "Quote required" : `Estimate €${quote.estimated_total.toFixed(2)}`}</span>{quote.staff_note && <p>{quote.staff_note}</p>}<details><summary>Products</summary>{quote.items.map((item) => <Item key={item.id} item={item} backend={backend} />)}</details></article>) : <p>No requests yet.</p>}</section>
  </div>
}
