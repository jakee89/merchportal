import { catalogSummary, futureStock, productPriceBreaks, supplierMasterReference } from "../normalization"

describe("supplier catalog normalization", () => {
  it("groups Stricker optional references under their parent product", () => {
    expect(
      supplierMasterReference("stricker", { Reference: "99822-105" }, "99822-105"),
    ).toBe("99822")
  })

  it("keeps a supplier's explicit parent reference", () => {
    expect(
      supplierMasterReference("stricker", { ProductReference: "99822" }, "99822-105"),
    ).toBe("99822")
  })

  it("creates a compact catalog summary without changing product detail text", () => {
    expect(catalogSummary("A long description with enough content to be shortened for the product card.", "Short summary")).toBe("Short summary")
  })

  it("uses Stricker ProdReference for decoration joins", () => {
    expect(
      supplierMasterReference("stricker", { ProdReference: "99164" }, "unrelated"),
    ).toBe("99164")
  })

  it("keeps midocean quantity prices and future stock arrivals", () => {
    expect(productPriceBreaks([{ payload: { price: "4,22", scale: [{ minimum_quantity: "250", price: "4,07" }] } }])).toEqual([
      { quantity: 1, price_eur: 4.22 },
      { quantity: 250, price_eur: 4.07 },
    ])
    expect(futureStock([{ payload: { qty: 811, first_arrival_date: "2026-09-25", first_arrival_qty: 3000 } }])).toEqual([
      { date: "2026-09-25", quantity: 3000 },
    ])
  })

  it("reads Stricker quantity columns", () => {
    expect(productPriceBreaks([{ payload: { YourPrice1: "2,10", YourPrice100: "1,75" } }])).toEqual([
      { quantity: 1, price_eur: 2.1 },
      { quantity: 100, price_eur: 1.75 },
    ])
  })
})
