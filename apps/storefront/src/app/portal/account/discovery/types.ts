import type { CatalogProduct } from "../catalog-card"

export type Selection = { product_id: string; sku: string; name: string }
export type Shortlist = {
  id: string
  name: string
  items: Array<{
    id: string
    product_id: string
    sku: string
    product: CatalogProduct | null
  }>
}
export type Suggestions = {
  products: Array<{ id: string; name: string; sku?: string }>
  categories: string[]
}
export type FeaturedCollection = { label: string; products: CatalogProduct[] }
export type Comparison = {
  product_id: string
  name: string
  sku: string
  image?: string
  color: string
  stock?: number
  materials: string[]
  dimensions?: string
  printing: Array<{ name: string; positions: string[] }>
  unit_price: number | null
  total: number | null
  error?: string
}
