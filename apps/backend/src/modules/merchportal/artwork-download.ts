import type { MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

export function artworkFiles(configuration: any): Array<{ file_id: string; filename: string }> {
  if (Array.isArray(configuration?.artwork_files) && configuration.artwork_files.length) return configuration.artwork_files.filter((file: any) => typeof file?.file_id === "string" && typeof file?.filename === "string").slice(0, 5)
  return configuration?.artwork_file_id ? [{ file_id: configuration.artwork_file_id, filename: configuration.artwork_filename || "artwork" }] : []
}

export async function sendArtworkDownload(scope: any, res: MedusaResponse, configuration: any, fileParam?: unknown) {
  const index = fileParam === undefined ? 0 : typeof fileParam === "string" && /^(0|[1-9]\d*)$/.test(fileParam) ? Number(fileParam) : -1
  const selected = artworkFiles(configuration)[index]
  if (!selected) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artwork is not available")
  const fileService = scope.resolve(Modules.FILE) as any
  const file = await fileService.retrieveFile(selected.file_id)
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
  const filename = selected.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "artwork"
  res.setHeader("Content-Type", "application/octet-stream")
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Security-Policy", "sandbox")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Cache-Control", "private, no-store")
  res.end(Buffer.concat(chunks, size))
}
