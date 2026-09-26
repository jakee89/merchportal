const maxBytes = 32 * 1024 * 1024
const maxImageBytes = 4 * 1024 * 1024
const ttlMs = 60 * 60 * 1000

type CachedImage = { body: Buffer; contentType: string; expiresAt: number }

const images = new Map<string, CachedImage>()
const pending = new Map<string, Promise<CachedImage | null>>()
let usedBytes = 0

export function cachedMakitoImage(url: string) {
  const image = images.get(url)
  if (!image) return null
  if (image.expiresAt <= Date.now()) {
    images.delete(url)
    usedBytes -= image.body.length
    return null
  }
  images.delete(url)
  images.set(url, image)
  return image
}

export async function loadMakitoImage(url: string, fetchImage: () => Promise<Response>) {
  const cached = cachedMakitoImage(url)
  if (cached) return { cached }
  const existing = pending.get(url)
  if (existing) {
    const shared = await existing
    if (shared) return { cached: shared }
  }

  let settle!: (image: CachedImage | null) => void
  const promise = new Promise<CachedImage | null>((resolve) => { settle = resolve })
  pending.set(url, promise)
  try {
    const response = await fetchImage()
    const contentType = response.headers.get("content-type") || ""
    if (!response.ok || !response.body || !(contentType.startsWith("image/") || contentType === "application/octet-stream")) {
      settle(null)
      return { response }
    }
    const size = Number(response.headers.get("content-length"))
    if (size > maxImageBytes) {
      settle(null)
      return { response }
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.length
      if (total > maxImageBytes) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const part of chunks) controller.enqueue(part)
            controller.enqueue(chunk.value)
          },
          async pull(controller) {
            const next = await reader.read()
            if (next.done) controller.close()
            else controller.enqueue(next.value)
          },
          cancel() { return reader.cancel() },
        })
        settle(null)
        return { response: new Response(body, { status: response.status, headers: response.headers }) }
      }
      chunks.push(chunk.value)
    }
    const image = {
      body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
      contentType,
      expiresAt: Date.now() + ttlMs,
    }
    while (usedBytes + image.body.length > maxBytes && images.size) {
      const oldest = images.keys().next().value as string
      usedBytes -= images.get(oldest)!.body.length
      images.delete(oldest)
    }
    images.set(url, image)
    usedBytes += image.body.length
    settle(image)
    return { cached: image }
  } catch (error) {
    settle(null)
    throw error
  } finally {
    if (pending.get(url) === promise) pending.delete(url)
  }
}
