import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import styles from "../../../../portal-shell.module.css"
import ProductImage from "../../product-image"
import Configurator from "./configurator"

type Product = {
  id: string; name: string; description?: string; short_description?: string; code?: string; category?: string; category_hierarchy: string[]; brand?: string; sustainable: boolean; images: string[]
  specifications: Array<{ label: string; value: string }>; downloads: Array<{ name: string; url: string }>; related: Array<{ id: string; name: string; image_url?: string; price_eur?: number }>
  variants: Array<{ id: string; sku?: string; title: string; color: string; size?: string; images: string[]; stock_quantity?: number; price_eur?: number; price_breaks?: Array<{ quantity: number; price_eur: number }>; future_stock?: Array<{ date: string; quantity: number }>; color_code?: string; ean?: string; pantone?: string; dimensions?: string }>
  decoration_options: Array<{ id: string; name: string; positions: Array<{ id: string; name: string; max_width_mm?: number; max_height_mm?: number; max_colours?: number; image_url?: string }>; price_breaks: Array<{ quantity: number; unit_price_eur: number; next_colour_price_eur?: number }>; price_ranges?: Array<{ area_from_cm2?: number; area_to_cm2?: number; price_breaks: Array<{ quantity: number; unit_price_eur: number; next_colour_price_eur?: number }> }>; setup_price_eur?: number; handling_price_breaks?: Array<{ quantity: number; unit_price_eur: number }>; pricing_type?: string; next_colour_cost_indicator?: boolean }>
}

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  try { const parsed = new URL(value); if (parsed.pathname.startsWith("/media/")) return `${backend.replace(/\/$/, "")}${parsed.pathname}` } catch {}
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await retrieveCustomer())) redirect("/portal/login")
  const { id } = await params
  let product: Product
  try { product = (await sdk.client.fetch<{ product: Product }>(`/portal-api/products/${id}`, { headers: await getAuthHeaders(), cache: "no-store" })).product } catch { notFound() }
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/portal/account" className={styles.brand}><span className={styles.mark}>M</span>MerchPortal</Link><Link className={styles.secondary} href="/portal/account">Back to catalogue</Link></header>
    <main className={styles.productMain}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href="/portal/account">Catalogue</Link>{product.category_hierarchy?.map((item) => <span key={item}>/ {item}</span>)}</nav>
      <header className={styles.productTitle}><div><div className={styles.badges}>{product.category && <span>{product.category}</span>}{product.sustainable && <span className={styles.ecoBadge}>Sustainable</span>}</div><h1>{product.name}</h1><p>{[product.brand, product.code ? `Code ${product.code}` : ""].filter(Boolean).join(" · ")}</p></div></header>
      <Configurator productId={product.id} productName={product.name} productImages={product.images} backend={backend} variants={product.variants} methods={product.decoration_options} />
      <div className={styles.productSections}>
        {product.description && <section><h2>Description</h2><p>{product.description}</p></section>}
        {product.specifications?.length > 0 && <section><h2>Specifications</h2><dl className={styles.specifications}>{product.specifications.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>}
        <section><h2>Printing options</h2>{product.decoration_options.length ? <div className={styles.methodSummary}>{product.decoration_options.map((method) => <article key={method.id}><strong>{method.name}</strong><span>{method.positions.map((position) => position.name).join(", ")}</span></article>)}</div> : <p>No customisation information available.</p>}</section>
        {product.downloads?.length > 0 && <section><h2>Downloads</h2><div className={styles.downloads}>{product.downloads.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.name} ↗</a>)}</div></section>}
      </div>
      {product.related?.length > 0 && <section className={styles.related}><h2>Similar products</h2><div className={styles.relatedGrid}>{product.related.map((item) => <article key={item.id}><Link href={`/portal/account/products/${item.id}`}><ProductImage src={mediaUrl(backend, item.image_url)} name={item.name} /><strong>{item.name}</strong><span>{item.price_eur === undefined ? "Price on request" : `From €${item.price_eur.toFixed(2)}`}</span></Link></article>)}</div></section>}
    </main>
  </div>
}
