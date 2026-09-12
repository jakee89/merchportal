"use client"

import Link from "next/link"
import { useState } from "react"
import styles from "../../portal-shell.module.css"
import ProductImage from "./product-image"

export type CatalogProduct = {
  id: string
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
  color_options: Array<{ name: string; image_url?: string; sku?: string; price_eur?: number; stock_quantity?: number }>
}

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  try {
    const parsed = new URL(value)
    if (parsed.pathname.startsWith("/media/")) return `${backend.replace(/\/$/, "")}${parsed.pathname}`
  } catch {}
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default function CatalogCard({ product, backend }: { product: CatalogProduct; backend: string }) {
  const [option, setOption] = useState(product.color_options?.[0])
  const price = option?.price_eur ?? product.price_eur
  const stock = option?.stock_quantity ?? product.stock_quantity
  return (
    <article className={styles.catalogCard}>
      <Link href={`/portal/account/products/${product.id}`} className={styles.cardImageLink} aria-label={`View ${product.name}`}>
        <ProductImage src={mediaUrl(backend, option?.image_url || product.image_url)} name={product.name} />
      </Link>
      <div className={styles.cardBody}>
        <div className={styles.badges}>{product.category && <span>{product.category}</span>}{product.sustainable && <span className={styles.ecoBadge}>Sustainable</span>}</div>
        {product.color_options?.length > 0 && <div className={styles.swatches} aria-label="Available colours">
          {product.color_options.slice(0, 7).map((item) => <button key={item.name} className={item.name === option?.name ? styles.activeSwatch : ""} type="button" title={item.name} aria-label={`Show ${item.name}`} onClick={() => setOption(item)}><span>{item.name.slice(0, 1)}</span></button>)}
          {product.color_options.length > 7 && <small>+{product.color_options.length - 7}</small>}
        </div>}
        <h2><Link href={`/portal/account/products/${product.id}`}>{product.name}</Link></h2>
        <p className={styles.cardCode}>Code: {option?.sku || product.sku || "On request"}</p>
        {product.description && <p className={styles.cardDescription}>{product.description}</p>}
        {product.brand && <p className={styles.cardBrand}>{product.brand}</p>}
        <div className={styles.cardCommercial}><strong>{price === undefined ? "Price on request" : `From €${price.toFixed(2)}`}</strong><span className={stock && stock > 0 ? styles.inStock : styles.onRequest}>{stock && stock > 0 ? `${stock.toLocaleString()} in stock` : "Availability on request"}</span></div>
        <Link className={styles.viewProduct} href={`/portal/account/products/${product.id}`}>View product <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  )
}
