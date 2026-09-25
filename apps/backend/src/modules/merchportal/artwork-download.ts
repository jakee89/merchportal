import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

export async function sendArtworkDownload(scope: any, res: MedusaResponse, configuration: any) {
  if (!configuration?.artwork_file_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork is not available")
  const fileService = scope.resolve(Modules.FILE) as any
  const file = await fileService.retrieveFile(configuration.artwork_file_id)
  const url = new URL(file.url)
  if (!["http:", "https:"].includes(url.protocol)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork storage URL is invalid")
  const upstream = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) })
  if (!upstream.ok || !upstream.body) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork is not available")
  const reader = upstream.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 10 * 1024 * 1024) {
      await reader.cancel()
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork exceeds the download limit")
    }
    chunks.push(Buffer.from(value))
  }
  const filename = String(configuration.artwork_filename || "artwork").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "artwork"
  res.setHeader("Content-Type", "application/octet-stream")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Security-Policy", "sandbox")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Cache-Control", "private, no-store")
  res.end(Buffer.concat(chunks, size))
}
