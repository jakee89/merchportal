"use client"

import Link from "next/link"
import { useState } from "react"
import styles from "../../portal-shell.module.css"
import ProductImage from "./product-image"
import { makitoColourHex } from "./makito-colours"

export type CatalogProduct = {
  id: string
  supplier_code?: string
  sku?: string
  name: string
  description?: string
  image_url?: string
  price_eur?: number
  max_price_eur?: number
  stock_quantity?: number
  category?: string
  brand?: string
  sustainable: boolean
  color_option_count?: number
  color_options: Array<{ name: string; color_hex?: string; image_url?: string; sku?: string; price_eur?: number; stock_quantity?: number; next_arrival?: { date: string; quantity: number } }>
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

export default function CatalogCard({ product, backend }: { product: CatalogProduct; backend: string }) {
  const [option, setOption] = useState(product.color_options?.[0])
  const price = option?.price_eur ?? product.price_eur
  const stock = option?.stock_quantity ?? product.stock_quantity
  const arrival = option?.next_arrival
  const productHref = `/portal/account/products/${product.id}${option?.sku ? `?sku=${encodeURIComponent(option.sku)}` : ""}`
  return (
    <article className={styles.catalogCard}>
      <Link href={productHref} className={styles.cardImageLink} aria-label={`View ${product.name}`}>
        <ProductImage src={mediaUrl(backend, option?.image_url || product.image_url)} name={product.name} />
      </Link>
      <div className={styles.cardBody}>
        <div className={styles.badges}>{product.category && <span>{product.category}</span>}{product.sustainable && <span className={styles.ecoBadge}>Sustainable</span>}</div>
        {product.color_options?.length > 0 && <><div className={styles.cardColourHeading}>Colours · {product.color_option_count || product.color_options.length} available</div><div className={styles.swatches} aria-label="Available colours">
          {product.color_options.slice(0, 7).map((item) => <button key={item.sku || item.name} className={item.sku === option?.sku ? styles.activeSwatch : ""} type="button" title={item.name} aria-label={`Show ${item.name}`} aria-pressed={item.sku === option?.sku} onClick={() => setOption(item)}>{(item.color_hex || (product.supplier_code === "makito" && makitoColourHex(item.name))) ? <span className={styles.swatchColour} style={{ backgroundColor: item.color_hex || makitoColourHex(item.name) }} /> : product.supplier_code === "makito" ? <span>{item.name.slice(0, 3)}</span> : item.image_url ? <ProductImage src={mediaUrl(backend, item.image_url)} name={item.name} /> : <span>{item.name.slice(0, 1)}</span>}</button>)}
          {(product.color_option_count || product.color_options.length) > 7 && <small>+{(product.color_option_count || product.color_options.length) - 7}</small>}
        </div><p className={styles.selectedColour}>Selected: {option?.name}</p></>}
        <h2><Link href={productHref}>{product.name}</Link></h2>
        <p className={styles.cardCode}>Code: {option?.sku || product.sku || "On request"}</p>
        {product.description && <p className={styles.cardDescription}>{product.description}</p>}
        {product.brand && <p className={styles.cardBrand}>{product.brand}</p>}
        <div className={styles.cardCommercial}><strong>{price === undefined ? "Price on request" : `From €${price.toFixed(2)}`}</strong><span className={stock && stock > 0 ? styles.inStock : styles.onRequest}>{stock && stock > 0 ? `${stock.toLocaleString()} in stock` : arrival ? `${arrival.quantity.toLocaleString()} incoming · ${new Date(arrival.date).toLocaleDateString()}` : stock === 0 ? "Out of stock" : "Availability on request"}</span></div>
        <Link className={styles.viewProduct} href={productHref}>Choose options <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  )
}
