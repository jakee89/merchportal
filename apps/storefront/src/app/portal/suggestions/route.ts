import { NextRequest, NextResponse } from "next/server"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import type { Suggestions } from "../account/discovery/types"

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120)
  try {
    const result = await sdk.client.fetch<Suggestions>(
      `/portal-api/discovery?kind=suggestions&q=${encodeURIComponent(q)}`,
      { headers: await getAuthHeaders(), cache: "no-store" },
    )
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch {
    return NextResponse.json(
      { products: [], categories: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
