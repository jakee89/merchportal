import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Readable } from "node:stream"
import { supplierImageUrl, supplierMediaType } from "../../../modules/merchportal/media"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { resolveSupplierCredential } from "../../../modules/merchportal/supplier-credentials"
import { makitoToken } from "../../../modules/merchportal/adapters/makito"
import { loadMakitoImage } from "../../../modules/merchportal/makito-image-cache"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const url = supplierImageUrl(req.params.token)
  if (!url) return res.status(404).json({ message: "Media not found" })
  try {
    const headers: Record<string, string> = { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,application/pdf" }
    let makitoCredential: string | undefined
    if (new URL(url).hostname === "apis.makito.es") {
      const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
      const [supplier] = await service.listSuppliers({ code: "makito" }, { take: 1 })
      makitoCredential = resolveSupplierCredential("makito", supplier?.configuration)
      if (!makitoCredential) return res.status(404).json({ message: "Media not found" })
      headers.Authorization = `Bearer ${await makitoToken(makitoCredential)}`
    }
    const request = () => fetch(url, {
      headers,
      signal: AbortSignal.timeout(20_000),
    })
    const fetchImage = async () => {
      let response = await request()
      if (response.status === 401 && makitoCredential) {
        headers.Authorization = `Bearer ${await makitoToken(makitoCredential, undefined, true)}`
        response = await request()
      }
      return response
    }
    const result = makitoCredential ? await loadMakitoImage(url, fetchImage) : { response: await fetchImage() }
    const upstream = result.response || new Response(result.cached ? Uint8Array.from(result.cached.body) : null, { headers: { "Content-Type": result.cached?.contentType || "" } })
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
