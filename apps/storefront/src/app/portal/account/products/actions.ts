"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export async function uploadPortalArtwork(input: {
  filename: string
  mime_type: string
  content: string
}) {
  try {
    return await sdk.client.fetch<{ file: { id: string; filename: string; proof: string } }>(
      "/portal-api/artwork",
      {
        method: "POST",
        headers: await getAuthHeaders(),
        body: input,
        cache: "no-store",
      },
    )
  } catch {
    throw new Error("Artwork could not be uploaded. Use a PDF, PNG, JPG or SVG under 10 MB, then try again.")
  }
}

export async function savePortalConfiguration(
  productId: string,
  input: Record<string, unknown>,
) {
  return sdk.client.fetch<{
    configuration: {
      id: string
      estimated_total: number | null
      branding_price_pending: boolean
      status: string
    }
  }>(`/portal-api/products/${productId}`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: input,
    cache: "no-store",
  })
}

export async function previewPortalConfiguration(productId: string, input: Record<string, unknown>) {
  return sdk.client.fetch<{
    configuration: {
      base_unit_price: number | null
      estimated_total: number | null
      branding_price_pending: boolean
      decoration_lines: Array<{ unit_price_eur: number | null; setup_price_eur: number | null; price_pending: boolean }>
      quantity_prices: Array<{ quantity: number; estimated_total: number | null; unit_price_eur: number | null }>
    }
  }>(`/portal-api/products/${productId}`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: { ...input, preview_only: true },
    cache: "no-store",
  })
}
