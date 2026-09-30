import Link from "next/link"
import { sdk } from "@lib/config"
import styles from "../../../../portal-shell.module.css"
import ProductImage from "../../product-image"

type RelatedProduct = { id: string; name: string; image_url?: string; price_eur?: number; price_from_quantity?: number; has_price_tiers?: boolean }

export default async function RelatedProducts({ id, headers }: { id: string; headers: Record<string, string> }) {
  let related: RelatedProduct[]
  try {
    related = (await sdk.client.fetch<{ related: RelatedProduct[] }>(`/portal-api/products/${encodeURIComponent(id)}?related_only=true`, { headers, cache: "no-store" })).related
  } catch {
    // Optional recommendations must not take down a working configurator.
    return null
  }
  if (!related.length) return null
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  const mediaUrl = (value?: string) => {
    if (!value) return
    if (value.startsWith("/media/")) return `/portal${value}`
    try { const parsed = new URL(value); if (parsed.pathname.startsWith("/media/")) return `/portal${parsed.pathname}` } catch {}
    return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
  }
  return <section className={styles.related}><h2>Similar products</h2><div className={styles.relatedGrid}>{related.map((item) => <article key={item.id}><Link href={`/portal/account/products/${item.id}`} prefetch={false}><ProductImage src={mediaUrl(item.image_url)} name={item.name} /><strong>{item.name}</strong><span>{item.price_eur === undefined ? "Price on request" : `${item.has_price_tiers ? "From " : ""}€${item.price_eur.toFixed(2)}/unit`}</span>{item.price_eur !== undefined && item.price_from_quantity && item.price_from_quantity > 1 && <span>at {item.price_from_quantity.toLocaleString()} units · plain product · excl. VAT</span>}</Link></article>)}</div></section>
}
