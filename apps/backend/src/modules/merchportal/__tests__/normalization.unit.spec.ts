import { catalogSummary, futureStock, normalizeSupplierCatalog, productPriceBreaks, supplierMasterReference } from "../normalization"

describe("supplier catalog normalization", () => {
  it("reports preparation progress so long imports can be monitored and stopped", async () => {
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "stricker", display_name: "Stricker" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => filters.record_type === "product" ? [{
        supplier_id: "supplier-1",
        external_id: "99164-103",
        payload: { ProdReference: "99164", Reference: "99164-103", Name: "Test pen", ColorDesc1: "Blue" },
      }] : []),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const onProgress = jest.fn().mockResolvedValue(undefined)
    const products = await normalizeSupplierCatalog({ resolve: () => service } as any, {
      supplier_code: "stricker",
      take: Number.MAX_SAFE_INTEGER,
      onProgress,
    })
    expect(products).toHaveLength(1)
    expect(onProgress.mock.calls).toEqual([[0, 1], [1, 1]])
  })

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
