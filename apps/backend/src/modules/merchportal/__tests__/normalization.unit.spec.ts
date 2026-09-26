import { catalogSummary, futureStock, normalizeSupplierCatalog, productPriceBreaks, supplierMasterReference } from "../normalization"
import { supplierImageToken } from "../media"
import { asRecords } from "../adapters/types"

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

  it("prefers each Stricker option image over the shared set image and retains supplied hex", async () => {
    const records = [
      { supplier_id: "supplier-1", external_id: "92323-102", payload: { ProdReference: "92323", Reference: "92323-102", Name: "Bag", ColorDesc1: "Pink", ColorCode: "102", ColorHex1: "#db3d6c", MainImage: "92323_set.jpg", OptionalImage1: "92323_102.jpg" } },
      { supplier_id: "supplier-1", external_id: "92323-150", payload: { ProdReference: "92323", Reference: "92323-150", Name: "Bag", ColorDesc1: "Natural", ColorCode: "150", MainImage: "92323_set.jpg", OptionalImage1: "92323_150.jpg" } },
    ]
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "stricker", display_name: "Stricker" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => filters.record_type === "product" ? records : []),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const products = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "stricker", take: 10 })
    const variants = products[0].variants
    expect(variants.find((item) => item.sku === "92323-102")?.images[0]).toBe(`/media/${supplierImageToken("https://cdn.hideacontent.com/public/products/1000x1000/92323_102.jpg")}`)
    expect(variants.find((item) => item.sku === "92323-150")?.images[0]).toBe(`/media/${supplierImageToken("https://cdn.hideacontent.com/public/products/1000x1000/92323_150.jpg")}`)
    expect(variants.find((item) => item.sku === "92323-102")?.color_hex).toBe("#db3d6c")
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

  it("reads numbered Stricker incoming stock dates and quantities", () => {
    expect(futureStock([{ payload: { Sku: "81141-105", Quantity: 21563, NextDate1: "2026-11-06", NextQuantity1: 18000, NextDate2: "", NextQuantity2: null } }])).toEqual([
      { date: "2026-11-06", quantity: 18000 },
    ])
  })

  it("joins Midocean print guides and prices by product code and variant SKU", async () => {
    const guide = "https://images.cdn.midocean.com/mo2639-front-khaki.png"
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "midocean", display_name: "midocean" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => {
        if (filters.record_type === "product") return [{ supplier_id: "supplier-1", external_id: "MO2639", payload: { master_code: "MO2639", product_name: "Bag", assets: [{ type: "document", subtype: "product_sheet", url: "https://cdn1.midocean.com/mo2639-sheet.pdf" }], variants: [{ sku: "MO2639-39", color: "Khaki" }] } }]
        if (filters.record_type === "price") return [{ supplier_id: "supplier-1", external_id: "MO2639-39", sku: "MO2639-39", payload: { sku: "MO2639-39", price: "3,50", scale: [{ minimum_quantity: 25, price: "3,20" }] } }]
        if (filters.record_type === "stock") return [{ supplier_id: "supplier-1", external_id: "MO2639-39", sku: "MO2639-39", payload: { sku: "MO2639-39", quantity: 127 } }]
        if (filters.record_type === "decoration") return [{ supplier_id: "supplier-1", external_id: "MO2639", payload: { product_code: "MO2639", print_template: "https://cdn1.midocean.com/mo2639-template.pdf", printing_positions: [{ position_id: "FRONT", max_print_size_width: 240, max_print_size_height: 240, images: [{ variant_color: "39", print_position_image_with_area: guide }], printing_techniques: [{ id: "TD1", name: "Digital transfer" }] }] } }]
        if (filters.record_type === "decoration_price") return [{ supplier_id: "supplier-1", payload: { print_techniques: [{ id: "TD1", scales: [{ minimum_quantity: 25, price: 1.2 }] }] } }]
        return []
      }),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const products = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "midocean" })
    expect(products[0].variants[0].color_code).toBe("39")
    expect(products[0].variants[0].price_breaks).toEqual([{ quantity: 1, price_eur: 3.5 }, { quantity: 25, price_eur: 3.2 }])
    expect(products[0].variants[0].stock_quantity).toBe(127)
    expect(products[0].decoration_options[0].positions[0].images).toEqual([{ variant_color: "39", url: `/media/${supplierImageToken(guide)}` }])
    expect(products[0].downloads).toEqual([
      { name: "product sheet", url: `/portal/media/${supplierImageToken("https://cdn1.midocean.com/mo2639-sheet.pdf")}` },
      { name: "print template", url: `/portal/media/${supplierImageToken("https://cdn1.midocean.com/mo2639-template.pdf")}` },
    ])
  })

  it("accepts Midocean print-feed wrappers", () => {
    const product = { product_code: "MO2639", printing_positions: [] }
    expect(asRecords({ print_data: [product] })).toEqual([product])
    expect(asRecords({ print_data: { MO2639: product } })).toEqual([product])
    expect(asRecords({ data: { products: [product] } })).toEqual([product])
  })

  it("uses the Stricker product title rather than its SEO code", async () => {
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "stricker", display_name: "Stricker" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => filters.record_type === "product" ? [{ supplier_id: "supplier-1", external_id: "11061", payload: { ProdReference: "11061", Name: "11061. Kitchen knife", SEOName: "11061", Sku: "11061-108", ColorDesc1: "Yellow" } }] : []),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const products = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "stricker" })
    expect(products[0].title).toBe("Kitchen knife")
  })

  it("does not invent a one-unit Midocean price from a higher quantity tier", () => {
    expect(productPriceBreaks([{ payload: { sku: "MO2639-39", scale: [{ minimum_quantity: 250, price: "3,20" }] } }])).toEqual([{ quantity: 250, price_eur: 3.2 }])
  })

  it("reads Stricker quantity columns", () => {
    expect(productPriceBreaks([{ payload: { YourPrice1: "2,10", YourPrice100: "1,75" } }])).toEqual([
      { quantity: 1, price_eur: 2.1 },
      { quantity: 100, price_eur: 1.75 },
    ])
  })

  it("applies the Stricker account price factor to actual quantity tiers", () => {
    expect(productPriceBreaks([{ payload: { Sku: "92396-103", YourPrice: "4,00", MinQt1: 25, Price1: "5,00", MinQt2: 100, Price2: "4,50" } }])).toEqual([
      { quantity: 1, price_eur: 4 },
      { quantity: 25, price_eur: 4 },
      { quantity: 100, price_eur: 3.6 },
    ])
    expect(productPriceBreaks([{ payload: { Sku: "92396-103", MinQt1: 50, Price1: "5,00" } }])).toEqual([{ quantity: 50, price_eur: 5 }])
  })

  it("joins Stricker option prices to the matching SKU before publishing", async () => {
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "stricker", display_name: "Stricker" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => {
        if (filters.record_type === "product") return [{ supplier_id: "supplier-1", external_id: "92396-103", sku: "92396-103", payload: { ProdReference: "92396", Sku: "92396-103", Name: "Backpack", ColorDesc1: "Black" } }]
        if (filters.record_type === "price") return [{ supplier_id: "supplier-1", external_id: "92396-103", sku: "92396-103", payload: { Sku: "92396-103", YourPrice: "4,00", MinQt1: 25, Price1: "5,00" } }]
        return []
      }),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const products = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "stricker" })
    expect(products[0].variants[0].price_breaks).toEqual([{ quantity: 1, price_eur: 4 }, { quantity: 25, price_eur: 4 }])
  })
})
