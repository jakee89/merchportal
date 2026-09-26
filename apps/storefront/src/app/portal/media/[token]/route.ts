const backend = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://backend:9000").replace(/\/$/, "")

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  try {
    const upstream = await fetch(`${backend}/media/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    const contentType = upstream.headers.get("content-type") || ""
    if (!upstream.ok || !upstream.body || !(contentType.startsWith("image/") || contentType.startsWith("application/pdf"))) {
      return Response.json({ message: "Media not found" }, { status: 404 })
    }
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        ...(contentType.startsWith("application/pdf") ? { "Content-Disposition": "inline; filename=\"supplier-document.pdf\"" } : {}),
      },
    })
  } catch {
    return Response.json({ message: "Media not found" }, { status: 404 })
  }
}
