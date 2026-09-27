import { NextResponse } from "next/server"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export async function POST(request: Request) {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return new NextResponse(null, { status: 401 })
  try {
    const body = await request.json()
    await sdk.client.fetch("/portal-api/usage", { method: "POST", body, headers, cache: "no-store" })
    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 400 })
  }
}
