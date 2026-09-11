import { productAttributes, sellingPrice, supplierCategory } from "../catalog-rules"

describe("catalog rules", () => {
  it("reads the supplier's original category", () => {
    expect(supplierCategory({ product: { family: "Drink Bottles" } })).toBe("Drink Bottles")
  })

  it("extracts safe searchable product attributes", () => {
    expect(
      productAttributes({
        lead_time: "5 working days",
        print_methods: ["Laser", "Pad Print"],
        material: "Recycled aluminium",
      }),
    ).toEqual({
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
})
