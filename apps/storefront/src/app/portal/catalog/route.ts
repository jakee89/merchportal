import { NextRequest, NextResponse } from "next/server"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { catalogQuery } from "../account/catalog-query"

export async function GET(request: NextRequest) {
  const headers = await getAuthHeaders()
  const privateHeaders = { "Cache-Control": "private, no-store" }
  if (!headers.authorization) return NextResponse.json({ message: "Sign in to view the catalog" }, { status: 401, headers: privateHeaders })
  let query: URLSearchParams
  try { query = catalogQuery(request.nextUrl.searchParams) } catch {
    return NextResponse.json({ message: "Invalid filters" }, { status: 400, headers: privateHeaders })
  }
  query.set("view", request.nextUrl.searchParams.get("view") === "facets" ? "facets" : "products")
  query.set("compact", "true")
  try {
    const result = await sdk.client.fetch(`/portal-api/catalog?${query}`, { headers, cache: "no-store", signal: request.signal })
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) {
    const failed = error as { status?: number; statusCode?: number }
    const status = failed.status || failed.statusCode
    return NextResponse.json({ message: "Catalog could not be loaded" }, { status: status === 401 || status === 403 ? status : 503, headers: privateHeaders })
  }
}
