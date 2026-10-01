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

  it("removes whole marking-technique branches without losing real product categories", () => {
    const input = [
      "Production > PRODUCTS > Marking Techniques > Digital Transfer",
      { name: "MARKING   TECHNIQUES > Circular Laser" },
      ["Marking Techniques", "Doming"],
      "Production > PRODUCTS > Drinkware > Bottles",
    ]
    expect(makitoCategoryPaths(input)).toEqual([["Drinkware", "Bottles"]])
    expect(makitoDocumentCategories({ category_paths: input }).levels).toEqual(["Drinkware", "Bottles"])
    expect(makitoDocumentCategories({ category_hierarchy: ["Production > Marking Techniques > Digital", "Production > PRODUCTS > Bags > Totes"] }).levels).toEqual(["Bags", "Totes"])
  })

  it("does not promote children of a marking-only legacy breadcrumb", () => {
    for (const document of [
      { category_paths: [["Marking Techniques", "Digital"]], category: "Digital" },
      { category_hierarchy: ["Production", "Marking Techniques", "Digital"], category: "Digital" },
      { category: "Marking Techniques > Digital" },
    ]) expect(makitoDocumentCategories(document)).toEqual({ paths: [], primary: [], levels: [] })
    expect(makitoCategoryPaths(["Products > Digital Accessories > Camera Bags"])).toEqual([["Digital Accessories", "Camera Bags"]])
  })
})
