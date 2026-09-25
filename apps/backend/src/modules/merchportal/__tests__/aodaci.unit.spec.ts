import { AodaciAdapter } from "../adapters/aodaci"
import { normalizeAodaciDecorationOptions, decorationPrice, validateDecorationChoice } from "../decoration"
import { normalizeSupplierCatalog, productPriceBreaks } from "../normalization"
import { supplierImageToken } from "../media"
import { deduplicateSupplierRecords } from "../sync"

const print = (sku: string, colourCount = 1) => ({
  productCode: "AAP001",
  productSKU: sku,
  currency: "EUR",
  productPrintLocationCode: "FRONT",
  productPrintLocationDescription: "Front",
  printTechniqueCode: "TXP",
  printTechniqueName: "Textile Printing",
  printTechniqueColor: colourCount,
  printTechniqueMaxColors: 2,
  printTechniqueWidthMM: 100,
  printTechniqueHeightMM: 80,
  printTechniqueImageImprintLines: `${sku}_FRONT_TXP.jpg`,
  printCode: "TXP1",
  minQty1: 25,
  price1: colourCount === 1 ? 1.2 : 1.8,
  minQty2: 100,
  price2: colourCount === 1 ? 0.9 : 1.4,
})

describe("AODACi supplier", () => {
  it("authenticates, fetches all pages and refreshes an expired token", async () => {
    const original = global.fetch
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: "token-1", expiresAtUtc: new Date(Date.now() + 300_000).toISOString() }) })
      .mockResolvedValueOnce({ ok: true, body: null, json: async () => ({ data: [{ productSKU: "AAP001_103" }], pagination: { totalPages: 2, nextPage: 2 } }) })
      .mockResolvedValueOnce({ ok: true, body: null, json: async () => ({ data: [{ productSKU: "AAP001_104" }], pagination: { totalPages: 2, nextPage: null } }) })
    global.fetch = fetchMock as typeof fetch
    try {
      const products = await new AodaciAdapter("secret").fetchProducts()
      expect(products).toHaveLength(2)
      expect(String(fetchMock.mock.calls[1][0])).toContain("page=1")
      expect(String(fetchMock.mock.calls[2][0])).toContain("page=2")
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer token-1")
    } finally {
      global.fetch = original
    }
  })

  it("uses client/reseller cost tiers, never recommended retail price", () => {
    expect(productPriceBreaks([{ productSKU: "AAP001_103", currency: "EUR", qtyScale1: 25, priceCatQty1: 9, priceResellerQty1: 2, priceClientQty1: 1.8, qtyScale2: 100, priceResellerQty2: 1.5 }])).toEqual([
      { quantity: 25, price_eur: 1.8 },
      { quantity: 100, price_eur: 1.5 },
    ])
  })

  it("keeps colour-specific variants, print guides, sizes and prices", async () => {
    const products = [
      { productCode: "AAP001", productSKU: "AAP001_103", productName: "Bag", productColour: "Black", productColourCode: "103", productMainImage: "AAP001_103.jpg" },
      { productCode: "AAP001", productSKU: "AAP001_104", productName: "Bag", productColour: "Blue", productColourCode: "104", productMainImage: "AAP001_104.jpg" },
    ]
    const printRows = [print("AAP001_103"), print("AAP001_103", 2), print("AAP001_104")]
    expect(deduplicateSupplierRecords(printRows, "aodaci", "decoration")).toHaveLength(3)
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "aodaci", display_name: "AODACi" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => {
        const rows = filters.record_type === "product" ? products : filters.record_type === "decoration" ? printRows : filters.record_type === "price" ? products.map((row) => ({ productCode: row.productCode, productSKU: row.productSKU, currency: "EUR", qtyScale1: 25, priceResellerQty1: 2 })) : []
        return rows.map((payload) => ({ id: `${payload.productSKU}-${payload.printTechniqueColor || "product"}`, supplier_id: "supplier-1", external_id: payload.productSKU, sku: payload.productSKU, payload }))
      }),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const [product] = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "aodaci", take: 10 })
    expect(product.variants).toHaveLength(2)
    expect(product.variants[0].images[0]).toBe(`/media/${supplierImageToken("https://cdn.aodaci.com/resources/img/AAP001_103.jpg")}`)
    expect(product.variants[1].images[0]).toBe(`/media/${supplierImageToken("https://cdn.aodaci.com/resources/img/AAP001_104.jpg")}`)
    expect(product.variants[0].price_breaks[0]).toEqual({ quantity: 25, price_eur: 2 })
    const method = product.decoration_options[0]
    const position = method.positions[0]
    expect(position.images?.[0].url).toBe(`/media/${supplierImageToken("https://cdn.aodaci.com/resources/printlines/AAP001_103_FRONT_TXP.jpg")}`)
    const size = position.size_options?.find((item) => item.variant_sku === "AAP001_103")!
    expect(validateDecorationChoice(method, position, { pricing_code: size.pricing_code, print_width_mm: 100, print_height_mm: 80 }, "AAP001_104")).toBeTruthy()
    expect(decorationPrice(method, 100, { pricing_code: size.pricing_code, variant_sku: "AAP001_103", colours: 2 })).toMatchObject({ unit: 1.4, pending: false })
    expect(decorationPrice(method, 10, { pricing_code: size.pricing_code, variant_sku: "AAP001_103", colours: 2 }).pending).toBe(true)
  })

  it("loads print records only for the selected AODACi catalogue page", async () => {
    const products = ["AAP001", "AAP002"].map((code) => ({
      id: code,
      supplier_id: "supplier-1",
      external_id: `${code}_103`,
      sku: `${code}_103`,
      payload: { productCode: code, productSKU: `${code}_103`, productName: code },
    }))
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "aodaci", display_name: "AODACi" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => filters.record_type === "product" ? products : []),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "aodaci", take: 1 })
    expect(service.listRawSupplierRecords).toHaveBeenCalledWith(
      expect.objectContaining({ record_type: "decoration", sku: ["AAP001_103"] }),
      expect.anything(),
    )
  })
})
