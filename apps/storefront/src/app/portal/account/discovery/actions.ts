"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { comparisonSelection, validQuantity } from "./selection"
import type {
  Comparison,
  FeaturedCollection,
  Selection,
  Shortlist,
} from "./types"

export async function getShortlists() {
  return sdk.client.fetch<{ shortlists: Shortlist[] }>(
    "/portal-api/discovery?kind=shortlists",
    { headers: await getAuthHeaders(), cache: "no-store" },
  )
}

export async function changeShortlist(input: Record<string, unknown>) {
  return sdk.client.fetch<{ shortlists: Shortlist[]; result_id?: string }>(
    "/portal-api/discovery",
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: input,
      cache: "no-store",
    },
  )
}

export async function getFeaturedCollections() {
  return sdk.client.fetch<{ collections: FeaturedCollection[] }>(
    "/portal-api/discovery?kind=featured",
    { headers: await getAuthHeaders(), cache: "no-store" },
  )
}

type Product = {
  id: string
  name: string
  images: string[]
  materials: string[]
  variants: Array<{
    id: string
    sku: string
    color: string
    title: string
    dimensions?: string
    size?: string
    stock_quantity?: number
    images: string[]
  }>
  decoration_options: Array<{
    name: string
    positions: Array<{
      name: string
      max_width_mm?: number
      max_height_mm?: number
    }>
  }>
}

async function productOption(
  productId: string,
  sku: string,
  headers: Record<string, string>,
) {
  const { product } = await sdk.client.fetch<{ product: Product }>(
    `/portal-api/products/${encodeURIComponent(productId)}?include_related=false`,
    { headers, cache: "no-store" },
  )
  const variant = product.variants.find((variant) => variant.sku === sku)
  if (!variant)
    throw new Error("Selected product option is no longer available")
  return { product, variant }
}

export async function compareProducts(
  input: Selection[],
  quantity: number,
): Promise<Comparison[]> {
  const selections = comparisonSelection(input)
  if (
    selections.length < 2 ||
    selections.length !== input.length ||
    !validQuantity(quantity)
  )
    throw new Error("Choose 2–4 products and a quantity between 1 and 100,000")
  const headers = await getAuthHeaders()
  return Promise.all(
    selections.map(async (item): Promise<Comparison> => {
      try {
        const { product, variant } = await productOption(
          item.product_id,
          item.sku,
          headers,
        )
        const { configuration } = await sdk.client.fetch<{
          configuration: {
            base_unit_price: number | null
            estimated_total: number | null
          }
        }>(`/portal-api/products/${encodeURIComponent(product.id)}`, {
          method: "POST",
          headers,
          body: {
            variant_id: variant.id,
            color: variant.color || variant.title,
            quantity,
            preview_only: true,
          },
          cache: "no-store",
        })
        return {
          product_id: product.id,
          name: product.name,
          sku: variant.sku,
          color: variant.color || variant.title,
          image: variant.images?.[0] || product.images?.[0],
          stock: variant.stock_quantity,
          materials: product.materials || [],
          dimensions: variant.dimensions || variant.size,
          printing: (product.decoration_options || []).map((method) => ({
            name: method.name,
            positions: method.positions.map(
              (position) =>
                `${position.name}${position.max_width_mm && position.max_height_mm ? ` · ${position.max_width_mm} × ${position.max_height_mm} mm` : ""}`,
            ),
          })),
          unit_price: configuration.base_unit_price,
          total: configuration.estimated_total,
        }
      } catch {
        return {
          product_id: item.product_id,
          sku: item.sku,
          name: item.name,
          color: "",
          materials: [],
          printing: [],
          unit_price: null,
          total: null,
          error:
            "Product or pricing unavailable. Open the product to check its current options.",
        }
      }
    }),
  )
}

export async function addShortlistToCart(
  listId: string,
  itemIds: string[],
  quantity: number,
) {
  if (
    !Array.isArray(itemIds) ||
    !itemIds.length ||
    itemIds.length > 20 ||
    new Set(itemIds).size !== itemIds.length ||
    !validQuantity(quantity)
  )
    throw new Error("Select 1–20 products and a quantity between 1 and 100,000")
  const { shortlists } = await getShortlists()
  const list = shortlists.find((list) => list.id === listId)
  const items = itemIds.map((id) => list?.items.find((item) => item.id === id))
  if (items.some((item) => !item?.product))
    throw new Error("Selected shortlist products are no longer available")
  const headers = await getAuthHeaders()
  const results: Array<{ id: string; added: boolean }> = []
  // The existing cart is a shared company cart. Sequential writes preserve
  // its item_ids array; successful items are never automatically retried.
  for (const item of items) {
    try {
      const { product, variant } = await productOption(
        item!.product_id,
        item!.sku,
        headers,
      )
      await sdk.client.fetch(
        `/portal-api/products/${encodeURIComponent(product.id)}`,
        {
          method: "POST",
          headers,
          body: {
            variant_id: variant.id,
            color: variant.color || variant.title,
            quantity,
          },
          cache: "no-store",
        },
      )
      results.push({ id: item!.id, added: true })
    } catch {
      results.push({ id: item!.id, added: false })
    }
  }
  return { results }
}
