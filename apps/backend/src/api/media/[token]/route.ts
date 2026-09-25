import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Readable } from "node:stream"
import { supplierImageUrl, supplierMediaType } from "../../../modules/merchportal/media"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = supplierImageUrl(req.params.token)
  if (!url) return res.status(404).json({ message: "Media not found" })
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,application/pdf" },
      signal: AbortSignal.timeout(20_000),
    })
    let contentType = upstream.headers.get("content-type") || ""
    if (!upstream.ok || !upstream.body) {
      return res.status(404).json({ message: "Media not found" })
    }
    let body: Readable
    if (contentType.toLowerCase().startsWith("application/octet-stream")) {
      const reader = upstream.body.getReader()
      const first = await reader.read()
      contentType = first.value ? supplierMediaType(first.value) || "" : ""
      if (!contentType) {
        await reader.cancel()
        return res.status(404).json({ message: "Media not found" })
      }
      body = Readable.from((async function* () {
        if (first.value) yield Buffer.from(first.value)
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          yield Buffer.from(chunk.value)
        }
      })())
    } else if (contentType.startsWith("image/") || contentType.startsWith("application/pdf")) {
      body = Readable.fromWeb(upstream.body as any)
    } else {
      return res.status(404).json({ message: "Media not found" })
    }
    res.setHeader("Content-Type", contentType)
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (contentType.startsWith("application/pdf")) res.setHeader("Content-Disposition", "inline; filename=\"supplier-document.pdf\"")
    body.pipe(res)
  } catch {
    return res.status(404).json({ message: "Media not found" })
  }
}
