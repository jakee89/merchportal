import { makitoCategoryPaths, makitoDocumentCategories } from "../makito-categories"

describe("Makito category paths", () => {
  const legacy = [
    "Production > PRODUCTS > Backpacks > Backpacks > Backpacks",
    "Production > PRODUCTS > Backpacks > Backpacks > Backpacks With Laptop Pocket",
    "Production > PRODUCTS > Outdoor > Outdoor Gadget > Leisure Accessories",
  ]

  it("separates complete supplier paths rather than stacking them as breadcrumb levels", () => {
    expect(makitoCategoryPaths(legacy)).toEqual([
      ["Backpacks"],
      ["Backpacks", "Backpacks With Laptop Pocket"],
      ["Outdoor", "Outdoor Gadget", "Leisure Accessories"],
    ])
    expect(makitoDocumentCategories({ category_hierarchy: legacy })).toEqual({
      paths: makitoCategoryPaths(legacy),
      primary: ["Backpacks", "Backpacks With Laptop Pocket"],
      levels: ["Backpacks", "Backpacks With Laptop Pocket", "Outdoor", "Outdoor Gadget", "Leisure Accessories"],
    })
  })

  it("accepts newly stored separate paths and supplier category objects", () => {
    expect(makitoDocumentCategories({ category_paths: [["Backpacks", "Laptop"], ["Travel", "Bags"]] }).primary).toEqual(["Backpacks", "Laptop"])
    expect(makitoCategoryPaths([{ name: "Production > PRODUCTS > Bags > Tote Bags" }])).toEqual([["Bags", "Tote Bags"]])
  })
})
