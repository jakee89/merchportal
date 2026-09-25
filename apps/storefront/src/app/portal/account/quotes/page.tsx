import Link from "next/link"
import { redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import styles from "../../../portal-shell.module.css"
import QuoteCart from "./quote-cart"

export type QuoteAddress = { line1: string; line2: string; city: string; postal_code: string; country_code: string }
export type QuoteDetails = { contact_name: string; contact_email: string; phone: string; company_name: string; vat_number: string; billing_address: QuoteAddress; delivery_address: QuoteAddress }
export type QuoteItem = { id: string; product_id: string; product_name: string; sku?: string; variant_size?: string; variant_dimensions?: string; image_url?: string; color: string; quantity: number; base_unit_price?: number | null; decorations: Array<{ method_name: string; position_name: string; position_image_url?: string; print_colours?: number; print_stitches?: number; print_width_mm?: number; print_height_mm?: number; max_width_mm?: number; max_height_mm?: number; unit_price_eur?: number | null; setup_price_eur?: number | null; price_pending: boolean }>; artwork_filename?: string; artwork_url?: string; artwork_files?: Array<{ filename: string; url: string }>; estimated_total: number | null; quote_required: boolean }
export type Quote = { id: string; status: string; estimated_total: number | null; final_total?: number | null; customer_note?: string; staff_note?: string; contact_details?: QuoteDetails; created_at: string; items: QuoteItem[] }

export default async function QuotePage() {
  if (!(await retrieveCustomer())) redirect("/portal/login")
  const { cart, history, buyer_details } = await sdk.client.fetch<{ cart: Quote | null; history: Quote[]; buyer_details: QuoteDetails }>("/portal-api/quotes", { headers: await getAuthHeaders(), cache: "no-store" })
  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/portal/account" className={styles.brand}><span className={styles.mark}>M</span>MerchPortal</Link><span className={styles.headerActions}><Link href="/portal/account/profile">Profile</Link><Link className={styles.secondary} href="/portal/account">Continue browsing</Link></span></header>
  <main className={styles.productMain}><h1>Quote cart</h1><p className={styles.helper}>Review your configured products and business details, then send one request for a final price.</p><QuoteCart cart={cart} history={history} buyerDetails={buyer_details} backend={process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"} /></main>
  </div>
}
