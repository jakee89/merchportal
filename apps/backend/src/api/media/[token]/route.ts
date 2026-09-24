import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Readable } from "node:stream"
import { supplierImageUrl } from "../../../modules/merchportal/media"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = supplierImageUrl(req.params.token)
  if (!url) return res.status(404).json({ message: "Media not found" })
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,application/pdf" },
      signal: AbortSignal.timeout(20_000),
    })
    const contentType = upstream.headers.get("content-type") || ""
    if (!upstream.ok || !(contentType.startsWith("image/") || contentType.startsWith("application/pdf")) || !upstream.body) {
      return res.status(404).json({ message: "Media not found" })
    }
    res.setHeader("Content-Type", contentType)
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (contentType.startsWith("application/pdf")) res.setHeader("Content-Disposition", "inline; filename=\"supplier-document.pdf\"")
    Readable.fromWeb(upstream.body as any).pipe(res)
  } catch {
    return res.status(404).json({ message: "Media not found" })
  }
}
