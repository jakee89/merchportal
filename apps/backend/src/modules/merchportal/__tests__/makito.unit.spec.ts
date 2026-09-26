import { MakitoAdapter } from "../adapters/makito"
import { decorationPrice, normalizeMakitoDecorationOptions } from "../decoration"
import { supplierImageToken } from "../media"
import { normalizeSupplierCatalog, productPriceBreaks } from "../normalization"
import { deduplicateSupplierRecords } from "../sync"
import { makitoColorLabels, makitoVariantLabel } from "../makito-colors"

const image = "https://apis.makito.es/catalog/assets/15246/15246003000/principal/5246-003-P.jpg"
const guide = "https://apis.makito.es/print-config/assets/15246/prod_previsualizacio/5246-A1.jpg"

describe("Makito supplier", () => {
  it("uses supplied variant names and removes apparel sizes from colour labels", () => {
    expect(makitoVariantLabel({ variant_name: "Polo Chaplin Arena L", variant_size: "L" }, "Chaplin")).toBe("Arena")
    const labels = makitoColorLabels([{ supplier_id: "supplier-1", payload: { name: "Komir", variants: [{ variant_colorcode: "013", variant_name: "Bag Komir Natural" }] } }])
    expect(labels.get("supplier-1:013")).toBe("Natural")
  })

  it("uses the catalog feed and preserves supplier variant metadata", async () => {
    const original = global.fetch
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "header.eyJleHAiOjk5OTk5OTk5OTl9.signature" }) })
      .mockResolvedValueOnce({ ok: true, body: null, json: async () => ({ products: [{ ref: "15246", variants: [{ variant_reference: "5246ROJS/T", variant_colorcode: "003", variant_name: "Bag Komir Red", variant_image: image }] }] }) })
    global.fetch = fetchMock as typeof fetch
    try {
      const products = await new MakitoAdapter(JSON.stringify({ clientId: "test-id", clientSecret: "test-secret" })).fetchProducts() as any[]
      expect(products[0].variants[0]).toMatchObject({ variant_reference: "5246ROJS/T", variant_material: "15246003000", variant_name: "Bag Komir Red" })
      expect(String(fetchMock.mock.calls[1][0])).toContain("/catalog/files?format=JSON&lang=en")
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toMatch(/^Bearer /u)
      expect(fetchMock.mock.calls.every((call) => call[1]?.method !== "POST" || String(call[0]).includes("/access/auth/login"))).toBe(true)
    } finally {
      global.fetch = original
    }
  })

  it("keeps product and variant identity, stock, and base-quantity price tiers", async () => {
    expect(deduplicateSupplierRecords([{ ref: "15246" }, { ref: "15246" }], "makito", "product")).toHaveLength(1)
    expect(productPriceBreaks([{ material: "15246", currency: "EUR", baseQuantity: "1000", scales: [{ quantity: "1", amount: "4400.00" }, { quantity: "500", amount: "4250.00" }] }])).toEqual([
      { quantity: 1, price_eur: 4.4 },
      { quantity: 500, price_eur: 4.25 },
    ])
    const records = (type: string) => ({
      product: [
        { supplier_id: "supplier-1", external_id: "15246", payload: { ref: "15246", name: "Komir", image, variants: [{ variant_reference: "5246ROJS/T", variant_material: "15246003000", variant_colorcode: "013", color: "013", variant_name: "Bag Komir Natural", variant_image: image, variant_size: "000" }] } },
        { supplier_id: "supplier-1", external_id: "15247", payload: { ref: "15247", name: "Komir 500 ml", image, variants: [{ variant_reference: "5247NAT", variant_colorcode: "013", color: "013", variant_name: "Bag Komir Natural", variant_size: "000" }] } },
      ],
      price: [{ supplier_id: "supplier-1", external_id: "15246", sku: "15246", payload: { material: "15246", currency: "EUR", baseQuantity: "1000", scales: [{ quantity: "1", amount: "4400.00" }] } }],
      stock: [{ supplier_id: "supplier-1", external_id: "15246003000", sku: "15246003000", payload: { material: "15246003000", quantity: 16 } }],
      decoration: [],
      decoration_price: [],
    } as Record<string, any[]>)[type] || []
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "supplier-1", code: "makito", display_name: "Makito" }]),
      listRawSupplierRecords: jest.fn().mockImplementation(async (filters) => records(filters.record_type)),
      listPublishedProductSources: jest.fn().mockResolvedValue([]),
    }
    const [product, other] = await normalizeSupplierCatalog({ resolve: () => service } as any, { supplier_code: "makito", take: 10 })
    expect(product.variants[0]).toMatchObject({ sku: "5246ROJS/T", stock_reference: "15246003000", color: "Natural", color_code: "013", stock_quantity: 16, price_eur: 4.4 })
    expect(other.variants[0]).toMatchObject({ sku: "5247NAT", color: "Natural", color_code: "013" })
    expect(product.variants[0].images[0]).toBe(`/media/${supplierImageToken(image)}`)
  })

  it("maps named print positions, one-colour tiers, setup and preview image", () => {
    const methods = normalizeMakitoDecorationOptions([{
      id: "15246", productCode: "15246",
      areas: [{ id: "A1", position: "2915", image: guide, width: 12, height: 6, techniques: "100123(4)" }],
      position_lookup: [{ id: "2915", description: "Upper front" }],
      technique_lookup: [{ id: "100123", description: "Pad printing", maximumColors: 4, fullColor: "false" }],
    }], [{ id: "100123", prices: { setupFee: 30, minPrice: 35, tiers: [{ threshold: "25", type: "UNIT", price: 0.4, additionalPrice: 0.2 }] } }])
    expect(methods[0].positions[0]).toMatchObject({ name: "Upper front", image_url: guide, max_width_mm: 120, max_height_mm: 60, max_colours: 4 })
    expect(decorationPrice(methods[0], 100, { colours: 2, width_mm: 120, height_mm: 60 })).toEqual({ unit: 0.6, handling: 0, setup: 30, pending: false })
    expect(decorationPrice(methods[0], 10).pending).toBe(true)
    expect(supplierImageToken(guide)).toBeTruthy()
  })
})
