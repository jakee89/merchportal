const completed = new Map<string, number>()

// Populate the existing Next image optimizer before a new client's first visit.
// Only public signed media-proxy paths; never credentials or upstream URLs.
export async function warmCatalogImages(products: Array<{ image_url?: string; color_options?: Array<{ image_url?: string }> }>, storefront = process.env.STORE_CORS?.split(",")[0], request: typeof fetch = fetch) {
  if (!storefront) return
  let origin: string
  try {
    const parsed = new URL(storefront)
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return
    origin = parsed.origin
  } catch { return }
  const urls: string[] = []
  for (const product of products.slice(0, 8)) {
    const image = product.color_options?.[0]?.image_url || product.image_url
    if (!image) continue
    let media: string
    try { media = new URL(image, "http://proxy.local").pathname } catch { continue }
    if (!/^\/media\/[a-zA-Z0-9_.-]+$/u.test(media)) continue
    for (const width of [384, 640]) {
      const url = `${origin}/_next/image?${new URLSearchParams({ url: `/portal${media}`, w: String(width), q: "75" })}`
      if ((completed.get(url) || 0) > Date.now() - 6 * 60 * 60_000 || urls.includes(url)) continue
      urls.push(url)
    }
  }
  const worker = async () => {
    while (urls.length) {
      const url = urls.shift()!
      try {
        const response = await request(url, { signal: AbortSignal.timeout(5_000), headers: { Accept: "image/webp" } })
        if (response.ok) {
          if (completed.size >= 128) completed.delete(completed.keys().next().value!)
          completed.set(url, Date.now())
        }
        await response.body?.cancel()
      } catch { /* Optional image warming must never affect startup or login. */ }
    }
  }
  await Promise.all([worker(), worker()])
}
