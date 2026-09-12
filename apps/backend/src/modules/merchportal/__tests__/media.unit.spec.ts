import { isAllowedSupplierImage } from "../media"

describe("supplier media allowlist", () => {
  it.each([
    "https://cdn.hideacontent.com/public/products/1000x1000/99164_103.jpg",
    "https://cdn1.midocean.com/image.jpg",
    "https://images.cdn.midocean.com/image.jpg",
    "https://cdn.aodaci.com/image.jpg",
    "https://content.aodaci.com/image.jpg",
  ])("allows documented supplier image host %s", (url) => {
    expect(isAllowedSupplierImage(url)).toBe(true)
  })

  it("rejects non-supplier hosts and insecure URLs", () => {
    expect(isAllowedSupplierImage("https://example.com/image.jpg")).toBe(false)
    expect(isAllowedSupplierImage("http://cdn.hideacontent.com/image.jpg")).toBe(false)
  })
})
