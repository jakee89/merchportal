import { catalogPreview } from "../catalog-preview"

describe("catalog preview", () => {
  it("retains filter and card fields without gallery or detail payloads", () => {
    const preview = catalogPreview({
      id: "product-1",
      name: "Backpack",
      description: "A long description",
      short_description: "Compact backpack",
      image_url: "/media/front",
      images: ["/media/front", "/media/back"],
      category: "Bags",
      category_hierarchy: ["Bags", "Backpacks"],
      colors: ["Black"],
      materials: ["Cotton"],
      stock_quantity: 12,
      downloads: [{ name: "PDF", url: "/portal/file" }],
      variants: [{ sku: "B-1", color: "Black", color_group: "Black", stock_quantity: 12, images: ["/media/black", "/media/detail"], future_stock: [{ date: "2026-10-01", quantity: 5 }, { date: "2026-11-01", quantity: 10 }], price_breaks: [{ quantity: 25, price_eur: 2 }] }],
    })
    expect(preview.description).toBe("Compact backpack")
    expect(preview.category_hierarchy).toEqual(["Bags", "Backpacks"])
    expect(preview.variants[0].images).toEqual(["/media/black"])
    expect(preview.variants[0].future_stock).toHaveLength(1)
    expect(preview).not.toHaveProperty("downloads")
    expect(preview).not.toHaveProperty("images")
    expect(preview.variants[0]).not.toHaveProperty("price_breaks")
  })
})
