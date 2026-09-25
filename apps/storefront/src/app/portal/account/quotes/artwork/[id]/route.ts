import { getAuthHeaders } from "@lib/data/cookies"

const backend = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://backend:9000").replace(/\/$/, "")

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const upstream = await fetch(`${backend}/portal-api/artwork/${encodeURIComponent(id)}`, { headers: await getAuthHeaders(), cache: "no-store" })
    if (!upstream.ok || !upstream.body) return Response.json({ message: "Artwork is not available" }, { status: 404 })
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": upstream.headers.get("content-disposition") || "attachment; filename=artwork",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return Response.json({ message: "Artwork is not available" }, { status: 404 })
  }
}
