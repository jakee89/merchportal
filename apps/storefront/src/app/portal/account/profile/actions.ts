"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import type { QuoteDetails } from "../quotes/page"

export async function saveProfile(details: QuoteDetails) {
  return sdk.client.fetch<{ profile: QuoteDetails }>("/portal-api/profile", { method: "PUT", headers: await getAuthHeaders(), body: { details }, cache: "no-store" })
}
