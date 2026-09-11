import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Readable } from "node:stream"
import { supplierImageUrl } from "../../../modules/merchportal/media"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = supplierImageUrl(req.params.token)
  if (!url) return res.status(404).json({ message: "Image not found" })
  const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const contentType = upstream.headers.get("content-type") || ""
  if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) {
    return res.status(404).json({ message: "Image not found" })
  }
  res.setHeader("Content-Type", contentType)
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
  Readable.fromWeb(upstream.body as any).pipe(res)
}
