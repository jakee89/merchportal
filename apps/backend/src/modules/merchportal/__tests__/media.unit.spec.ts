import { isAllowedSupplierImage, supplierMediaType } from "../media"

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

  it("identifies supplier images served as generic binary data without trusting the label", () => {
    expect(supplierMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(supplierMediaType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png")
    expect(supplierMediaType(Uint8Array.from([0, 1, 2, 3]))).toBeNull()
  })
})
