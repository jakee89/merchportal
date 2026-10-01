"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import styles from "../../portal-shell.module.css"
import ProductImage from "./product-image"
import { makitoColourHex } from "./makito-colours"
import { descriptionText } from "./description-text"
import { ProductActions } from "./discovery/provider"

export type CatalogProduct = {
  id: string
  supplier_code?: string
  sku?: string
  name: string
  description?: string
  image_url?: string
  price_eur?: number
  price_from_quantity?: number
  has_price_tiers?: boolean
  max_price_eur?: number
  stock_quantity?: number
  category?: string
  brand?: string
  sustainable: boolean
  color_option_count?: number
  color_options: Array<{ name: string; color_hex?: string; image_url?: string; sku?: string; price_eur?: number; price_from_quantity?: number; has_price_tiers?: boolean; stock_quantity?: number; next_arrival?: { date: string; quantity: number } }>
}

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  if (value.startsWith("/media/")) return `/portal${value}`
  try {
    const parsed = new URL(value)
    if (parsed.pathname.startsWith("/media/")) return `/portal${parsed.pathname}`
  } catch {}
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default function CatalogCard({ product, backend, priority = false }: { product: CatalogProduct; backend: string; priority?: boolean }) {
  const router = useRouter()
  const prefetched = useRef(new Set<string>())
  const [option, setOption] = useState(product.color_options?.[0])
  const price = option?.price_eur ?? product.price_eur
  const priceFromQuantity = option?.price_from_quantity ?? product.price_from_quantity
  const hasPriceTiers = option?.has_price_tiers ?? product.has_price_tiers
  const stock = option?.stock_quantity ?? product.stock_quantity
  const arrival = option?.next_arrival
  const productHref = `/portal/account/products/${product.id}${option?.sku ? `?sku=${encodeURIComponent(option.sku)}` : ""}`
  const prefetch = () => {
    if (prefetched.current.has(productHref) || prefetched.current.size >= 2) return
    prefetched.current.add(productHref)
    router.prefetch(productHref)
  }
  return (
    <article className={styles.catalogCard}>
      <Link href={productHref} prefetch={false} onMouseEnter={prefetch} onFocus={prefetch} className={styles.cardImageLink} aria-label={`View ${product.name}`}>
        <ProductImage src={mediaUrl(backend, option?.image_url || product.image_url)} name={product.name} priority={priority} sizes="(max-width: 620px) calc(100vw - 64px), (max-width: 900px) calc(50vw - 48px), 280px" />
      </Link>
      <div className={styles.cardBody}>
        <div className={styles.badges}>{product.category && <span>{product.category}</span>}{product.sustainable && <span className={styles.ecoBadge}>Sustainable</span>}</div>
        {product.color_options?.length > 0 && <><div className={styles.cardColourHeading}>Colours · {product.color_option_count || product.color_options.length} available</div><div className={styles.swatches} aria-label="Available colours">
          {product.color_options.slice(0, 7).map((item) => <button key={item.sku || item.name} className={item.sku === option?.sku ? styles.activeSwatch : ""} type="button" title={item.name} aria-label={`Show ${item.name}`} aria-pressed={item.sku === option?.sku} onClick={() => setOption(item)}>{(item.color_hex || (product.supplier_code === "makito" && makitoColourHex(item.name))) ? <span className={styles.swatchColour} style={{ backgroundColor: item.color_hex || makitoColourHex(item.name) }} /> : product.supplier_code === "makito" ? <span>{item.name.slice(0, 3)}</span> : item.image_url ? <ProductImage src={mediaUrl(backend, item.image_url)} name={item.name} sizes="25px" /> : <span>{item.name.slice(0, 1)}</span>}</button>)}
          {(product.color_option_count || product.color_options.length) > 7 && <small>+{(product.color_option_count || product.color_options.length) - 7}</small>}
        </div><p className={styles.selectedColour}>Selected: {option?.name}</p></>}
        <h2><Link href={productHref} prefetch={false} onMouseEnter={prefetch} onFocus={prefetch}>{product.name}</Link></h2>
        <p className={styles.cardCode}>Code: {option?.sku || product.sku || "On request"}</p>
        {product.description && <p className={styles.cardDescription}>{descriptionText(product.description)}</p>}
        {product.brand && <p className={styles.cardBrand}>{product.brand}</p>}
        <div className={styles.cardCommercial}><strong>{price === undefined ? "Price on request" : `${hasPriceTiers ? "From " : ""}€${price.toFixed(2)}/unit`}</strong>{price !== undefined && <small>{priceFromQuantity && priceFromQuantity > 1 ? `${hasPriceTiers ? "at" : "available from"} ${priceFromQuantity.toLocaleString()} units · ` : ""}plain product · excl. VAT</small>}<span className={stock && stock > 0 ? styles.inStock : styles.onRequest}>{stock && stock > 0 ? `${stock.toLocaleString()} in stock` : arrival ? `${arrival.quantity.toLocaleString()} incoming · ${new Date(arrival.date).toLocaleDateString()}` : stock === 0 ? "Out of stock" : "Availability on request"}</span></div>
        <Link className={styles.viewProduct} href={productHref} prefetch={false} onMouseEnter={prefetch} onFocus={prefetch}>Choose options <span aria-hidden="true">→</span></Link>
        <ProductActions item={{ product_id: product.id, sku: option?.sku || product.sku || "", name: product.name }} />
      </div>
    </article>
  )
}
