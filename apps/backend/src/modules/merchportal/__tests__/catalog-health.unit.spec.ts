import { catalogHealthIssues, mediaHealthId } from "../catalog-health"
import { supplierImageToken } from "../media"

describe("supplier data health", () => {
  const now = Date.parse("2026-09-30T12:00:00Z")
  const source = { print_option_count: 2, cost_by_sku: { "ABC-01": 1.5 }, catalog_preview: { image_url: "/media/good", variants: [{ sku: "ABC-01" }, { sku: "ABC-02", price_breaks: [{ quantity: 100, price_eur: 2 }] }] } }
  it("uses supplied quantity prices and supplier costs without treating them as missing", () => {
    expect(catalogHealthIssues(source, { stock_sync_at: new Date(now - 3600000) }, new Set(), 48, now)).toEqual([])
  })
  it("distinguishes missing image data, observed image failures and stale stock", () => {
    expect(catalogHealthIssues(source, { stock_sync_at: new Date(now - 49 * 3600000) }, new Set([mediaHealthId("good")]), 48, now)).toEqual(["failed_images", "stale_stock"])
    expect(catalogHealthIssues({ catalog_preview: { variants: [{ sku: "ABC" }] } }, {}, new Set(), 48, now)).toEqual(["missing_prices", "missing_print_options", "missing_images", "stale_stock"])
  })
  it("matches failures against raw supplier images stored in existing previews", () => {
    const image = "https://cdn.hideacontent.com/products/bag.jpg"
    const failed = new Set([mediaHealthId(supplierImageToken(image)!)])
    expect(catalogHealthIssues({ ...source, catalog_preview: { ...source.catalog_preview, image_url: image } }, { stock_sync_at: new Date(now) }, failed, 48, now)).toEqual(["failed_images"])
  })
})
