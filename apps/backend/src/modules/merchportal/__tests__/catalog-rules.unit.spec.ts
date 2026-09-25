import { categoryHierarchy, markedUpPrintUnitPrice, productAttributes, productSpecifications, sellingPrice, supplierCategory } from "../catalog-rules"

describe("catalog rules", () => {
  it("reads the supplier's original category", () => {
    expect(supplierCategory({ product: { family: "Drink Bottles" } })).toBe("Drink Bottles")
  })

  it("extracts safe searchable product attributes", () => {
    expect(productAttributes({ lead_time: "5 working days", print_methods: ["Laser", "Pad Print"], material: "Recycled aluminium" })).toEqual({
      lead_time: "5 working days",
      print_methods: ["Laser", "Pad Print"],
      materials: ["Recycled aluminium"],
      brand: undefined,
      country_of_origin: undefined,
      dimensions: undefined,
      weight: undefined,
      keywords: [],
      sustainable: true,
    })
  })

  it("calculates a rounded selling price from private cost", () => {
    expect(sellingPrice(4.2, 30)).toBe(5.46)
  })

  it("preserves fractional-cent print pricing until the quantity total", () => {
    const unit = markedUpPrintUnitPrice(0.589, 30)
    expect(unit).toBe(0.7657)
    expect(Math.round(unit * 1000 * 100) / 100).toBe(765.7)
  })

  it("retains Stricker category hierarchy and specifications", () => {
    const payload = { TypeDescription: "Writing instruments", SubTypeDescription: "Metal pens", Composition: "Recycled aluminium", CombinedSizes: "Ø10 × 140 mm", CountryOfOrigin: "CN", TaricCode: "96081092" }
    expect(supplierCategory(payload)).toBe("Metal pens")
    expect(categoryHierarchy(payload)).toEqual(["Writing instruments", "Metal pens"])
    expect(productSpecifications(payload)).toEqual(expect.arrayContaining([
      { label: "Material", value: "Recycled aluminium" },
      { label: "Dimensions", value: "Ø10 × 140 mm" },
      { label: "Tariff code", value: "96081092" },
    ]))
  })
})
