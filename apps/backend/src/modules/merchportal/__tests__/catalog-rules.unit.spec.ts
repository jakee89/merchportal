import {
  productAttributes,
  sellingPrice,
  suggestCategory,
  supplierCategory,
} from "../catalog-rules"

describe("catalog rules", () => {
  it("maps supplier categories into the shared taxonomy", () => {
    expect(suggestCategory("Travel backpacks")).toEqual({
      category: "Bags / Backpacks",
      confidence: 0.97,
    })
    expect(supplierCategory({ product: { family: "Drink Bottles" } }))
      .toBe("Drink Bottles")
  })

  it("extracts safe searchable product attributes", () => {
    expect(productAttributes({
      lead_time: "5 working days",
      print_methods: ["Laser", "Pad Print"],
      material: "Recycled aluminium",
    })).toEqual({
      lead_time: "5 working days",
      print_methods: ["Laser", "Pad Print"],
      sustainable: true,
    })
  })

  it("calculates a rounded selling price from private cost", () => {
    expect(sellingPrice(4.2, 30)).toBe(5.46)
  })
})
