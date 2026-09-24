"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export async function uploadPortalArtwork(input: {
  filename: string
  mime_type: string
  content: string
}) {
  return sdk.client.fetch<{ file: { id: string; filename: string } }>(
    "/portal-api/artwork",
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: input,
      cache: "no-store",
    },
  )
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
      estimated_total: number | null
      branding_price_pending: boolean
      decoration_lines: Array<{ unit_price_eur: number | null; setup_price_eur: number | null; price_pending: boolean }>
    }
  }>(`/portal-api/products/${productId}`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: { ...input, preview_only: true },
    cache: "no-store",
  })
}
