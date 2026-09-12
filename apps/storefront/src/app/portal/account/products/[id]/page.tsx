import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import styles from "../../../../portal-shell.module.css"
import Configurator from "./configurator"

type Product = {
  id: string
  name: string
  description?: string
  images: string[]
  variants: Array<{
    id: string
    sku?: string
    title: string
    color: string
    size?: string
    images: string[]
    stock_quantity?: number
    price_eur: number
    price_breaks?: Array<{ quantity: number; price_eur: number }>
    future_stock?: Array<{ date: string; quantity: number }>
    color_code?: string
  }>
  decoration_options: Array<{
    id: string
    name: string
    positions: Array<{
      id: string
      name: string
      max_width_mm?: number
      max_height_mm?: number
      max_colours?: number
      image_url?: string
    }>
    price_breaks: Array<{
      quantity: number
      unit_price_eur: number
      next_colour_price_eur?: number
    }>
    price_ranges?: Array<{
      area_from_cm2?: number
      area_to_cm2?: number
      price_breaks: Array<{
        quantity: number
        unit_price_eur: number
        next_colour_price_eur?: number
      }>
    }>
    setup_price_eur?: number
    handling_price_breaks?: Array<{
      quantity: number
      unit_price_eur: number
    }>
    pricing_type?: string
    next_colour_cost_indicator?: boolean
  }>
}

export default async function ProductConfiguratorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await retrieveCustomer())) redirect("/portal/login")
  const { id } = await params
  let product: Product
  try {
    const result = await sdk.client.fetch<{ product: Product }>(`/portal-api/products/${id}`, { headers: await getAuthHeaders(), cache: "no-store" })
    product = result.product
  } catch {
    notFound()
  }
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/portal/account" className={styles.brand}>
          <span className={styles.mark}>M</span>MerchPortal
        </Link>
        <Link className={styles.secondary} href="/portal/account">
          Back to catalog
        </Link>
      </header>
      <main className={styles.main}>
        <div className={styles.productDetailHeader}>
          <div>
            <span className={styles.eyebrow}>Product configurator</span>
            <h1>{product.name}</h1>
            <p className={styles.muted}>{product.description}</p>
            <p className={styles.status}>{product.variants.length} colour and product options</p>
          </div>
        </div>
        <Configurator productId={product.id} productName={product.name} productImages={product.images} backend={backend} variants={product.variants} methods={product.decoration_options} />
      </main>
    </div>
  )
}
