"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export async function removeQuoteItem(id: string) {
  return sdk.client.fetch(`/portal-api/quotes/items/${encodeURIComponent(id)}`, { method: "DELETE", headers: await getAuthHeaders(), cache: "no-store" })
}

export async function submitQuote(note: string, details: Record<string, unknown>) {
  return sdk.client.fetch<{ notification_sent: boolean }>(`/portal-api/quotes`, { method: "POST", headers: await getAuthHeaders(), body: { note, details }, cache: "no-store" })
}
