import { cachedMakitoImage, loadMakitoImage, loadSupplierImage } from "../makito-image-cache"

describe("Makito image cache", () => {
  it("also shares downloads for other suppliers and never caches failures or PDFs", async () => {
    const url = "https://cdn.hideacontent.com/public/test/cache.jpg"
    const fetchImage = jest.fn(async () => new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/jpeg" } }))
    await Promise.all([loadSupplierImage(url, fetchImage), loadSupplierImage(url, fetchImage)])
    expect(fetchImage).toHaveBeenCalledTimes(1)
    const failed = "https://cdn.hideacontent.com/public/test/fail.jpg"
    const unavailable = jest.fn(async () => new Response(null, { status: 404 }))
    await loadSupplierImage(failed, unavailable)
    await loadSupplierImage(failed, unavailable)
    expect(unavailable).toHaveBeenCalledTimes(2)
    const pdf = "https://cdn.hideacontent.com/public/test/document.pdf"
    const response = await loadSupplierImage(pdf, async () => new Response("pdf", { headers: { "Content-Type": "application/pdf" } }))
    expect(await response.response?.text()).toBe("pdf")
    expect(cachedMakitoImage(pdf)).toBeNull()
  })
  it("shares simultaneous downloads and serves later requests from memory", async () => {
    const url = "https://apis.makito.es/catalog/assets/test/shared.jpg"
    const fetchImage = jest.fn(async () => new Response(Uint8Array.from([0xff, 0xd8, 0xff]), {
      headers: { "Content-Type": "image/jpeg" },
    }))
    const [first, second] = await Promise.all([
      loadMakitoImage(url, fetchImage),
      loadMakitoImage(url, fetchImage),
    ])
    expect(fetchImage).toHaveBeenCalledTimes(1)
    expect(first.cached?.body.equals(second.cached!.body)).toBe(true)
    expect((await loadMakitoImage(url, fetchImage)).cached).toBeDefined()
    expect(fetchImage).toHaveBeenCalledTimes(1)
  })

  it("streams images larger than the per-image cap without retaining them", async () => {
    const url = "https://apis.makito.es/catalog/assets/test/large.jpg"
    const body = new Uint8Array(4 * 1024 * 1024 + 1)
    const result = await loadMakitoImage(url, async () => new Response(body, {
      headers: { "Content-Type": "image/jpeg" },
    }))
    expect(result.cached).toBeUndefined()
    expect(await result.response?.arrayBuffer()).toHaveProperty("byteLength", body.length)
    expect(cachedMakitoImage(url)).toBeNull()
  })
})
