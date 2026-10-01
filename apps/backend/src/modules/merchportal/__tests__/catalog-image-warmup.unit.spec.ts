import { warmCatalogImages } from "../catalog-image-warmup"

it("warms only the first eight public media images, with two concurrent requests and no credentials", async () => {
  const requests: Array<{ url: string; options: any }> = []
  let current = 0, maximum = 0
  const request = jest.fn(async (url: any, options: any) => {
    requests.push({ url, options })
    current++
    maximum = Math.max(maximum, current)
    await Promise.resolve()
    current--
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/webp" } })
  })
  const products = Array.from({ length: 20 }, (_, index) => ({ image_url: `/media/test-image-${index}` }))
  await warmCatalogImages(products, "https://test-portal.example", request as any)
  expect(requests).toHaveLength(16)
  expect(maximum).toBeLessThanOrEqual(2)
  for (const { url, options } of requests) {
    expect(new URL(url).searchParams.get("url")).toMatch(/^\/portal\/media\/test-image-[0-7]$/)
    expect(options.headers).toEqual({ Accept: "image/webp" })
  }
  await warmCatalogImages(products, "https://test-portal.example", request as any)
  expect(requests).toHaveLength(16)
})

it("does not warm supplier APIs, invalid origins, missing images or PDFs", async () => {
  const request = jest.fn()
  await warmCatalogImages([{ image_url: "https://supplier.example/image.jpg" }, { image_url: "/artwork/private.pdf" }, {}], "https://portal.example", request)
  await warmCatalogImages([{ image_url: "/media/valid" }], "file:///tmp", request)
  await warmCatalogImages([{ image_url: "/media/valid" }], "https://user:password@portal.example", request)
  expect(request).not.toHaveBeenCalled()
})
