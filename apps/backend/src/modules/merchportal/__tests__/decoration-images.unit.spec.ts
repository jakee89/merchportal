jest.mock("../related-products", () => ({ relatedProductSources: jest.fn().mockResolvedValue([]) }))
jest.mock("../catalog-data", () => ({ ...jest.requireActual("../catalog-data"), catalogRevision: jest.fn().mockResolvedValue({ source: "test", settings: "test" }) }))

import { GET } from "../../../api/portal-api/products/[id]/route"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { supplierImageToken } from "../media"
import { productDecorationImages } from "../decoration-images"
import { strickerPositionImages, validateDecorationChoice } from "../decoration"
import { supplierAssetUrl } from "../normalization"
import { clearPortalCatalogCache } from "../catalog-cache"

describe("existing product decoration images", () => {
  beforeEach(() => clearPortalCatalogCache())
  it("prefers dotted Stricker area guides over plain colour-specific location photos", async () => {
    const rows = ["102", "124"].map((colour) => ({
      Sku: `91693-${colour}`, ColorDesc1: colour === "124" ? "Light blue" : "Pink",
      Component1: "Ball pen", Location1: "Barrel", Area1Image: "91693_1_1_1.png, 91693_1_1_2.png", Location1Image: `91693_${colour}_C1_L1.png`,
      Component2: "Ball pen", Location2: "Barrel 2", Area2Image: "91693_1_2_1.png", Location2Image: `91693_${colour}_C1_L2.png`,
    }))
    const source = { supplier_id: "stricker", catalog_document: { variants: rows.map((row) => ({ sku: row.Sku })) }, decoration_options: [{ id: "DUV1", name: "Digital UV", price_breaks: [], positions: [{ id: "ball-pen-barrel", name: "Barrel", max_width_mm: 55, max_height_mm: 6 }, { id: "ball-pen-barrel-2", name: "Barrel 2", max_width_mm: 55, max_height_mm: 6 }] }] }
    const service = { listRawSupplierRecords: jest.fn().mockResolvedValue(rows.map((payload) => ({ payload }))) }
    const [method] = await productDecorationImages(service, source, "stricker")
    for (const [index, position] of method.positions.entries()) {
      expect(position.images).toEqual([{ variant_sku: undefined, variant_color: undefined, url: `/media/${supplierImageToken(`https://cdn.hideacontent.com/public/printings/printinglines/500x500/91693_1_${index + 1}_1.png`)}` }])
      expect(position.max_width_mm).toBe(55)
    }
    expect(supplierAssetUrl("91693_124_C1_L1.png", "stricker")).toBe("https://cdn.hideacontent.com/public/printings/locations/500x500/91693_124_C1_L1.png")
    expect(supplierAssetUrl("91693_1_1_1.png", "stricker")).toContain("/printinglines/")
  })

  it("does not label shared area images as exact colour matches when location images are missing", () => {
    const guides = strickerPositionImages(["102", "124"].map((colour) => ({ Sku: `91693-${colour}`, ColorDesc1: colour, Component1: "Ball pen", Location1: "Barrel", Area1Image: "91693_1_1_1.png" })))
    expect(guides.get("ball-pen-barrel")).toEqual([{ url: "91693_1_1_1.png", variant_sku: undefined, variant_color: undefined }])
  })

  it("replaces legacy exact-SKU photos on existing products without changing pricing or sizes", async () => {
    const photo = `/media/${supplierImageToken(supplierAssetUrl("93715_104_C2_L2.png", "stricker"))}`
    const source = {
      supplier_id: "stricker", catalog_document: { variants: [{ sku: "93715-104" }] },
      decoration_options: [{ id: "PDP1", name: "Pad Printing", price_breaks: [{ quantity: 25, unit_price_eur: 0.5 }], setup_price_eur: 20,
        positions: [{ id: "notepad-back", name: "Notepad - Back", max_width_mm: 70, max_height_mm: 160,
          image_url: photo, images: [{ variant_sku: "93715-104", variant_color: "Blue", url: photo }] }],
      }],
    }
    const original = JSON.stringify(source)
    const service = { listRawSupplierRecords: jest.fn().mockResolvedValue([{ payload: {
      Sku: "93715-104", ColorDesc1: "Blue", Component1: "Notepad", Location1: "Back",
      Area1Image: "93715_1_2_1.png, 93715_1_2_2.png", Location1Image: "93715_104_C2_L2.png",
    } }]) }
    const [method] = await productDecorationImages(service, source, "stricker")
    const guide = `/media/${supplierImageToken(supplierAssetUrl("93715_1_2_1.png", "stricker"))}`
    expect(method.positions[0]).toEqual({
      id: "notepad-back", name: "Notepad - Back", max_width_mm: 70, max_height_mm: 160,
      image_url: guide, images: [{ url: guide, variant_sku: undefined, variant_color: undefined }],
    })
    expect(method.price_breaks).toEqual(source.decoration_options[0].price_breaks)
    expect(method.setup_price_eur).toBe(20)
    expect(JSON.stringify(source)).toBe(original)

    service.listRawSupplierRecords.mockResolvedValue([{ payload: {
      Sku: "93715-104", ColorDesc1: "Blue", Component1: "Notepad", Location1: "Back",
      Area1Image: "", Location1Image: "93715_104_C2_L2.png",
    } }])
    const [withoutGuide] = await productDecorationImages(service, source, "stricker")
    expect(withoutGuide.positions[0].images).toEqual([])
    expect(withoutGuide.positions[0].image_url).toBeUndefined()
  })

  it("rejects oversized Midocean dimensions even when no fixed size buttons exist", () => {
    const method = { id: "D1", name: "Digital transfer", positions: [], price_breaks: [], colour_mode: "full_colour" as const }
    const position = { id: "FRONT", name: "Front", max_width_mm: 180, max_height_mm: 160 }
    expect(validateDecorationChoice(method, position, { print_width_mm: 180, print_height_mm: 160 })).toBeNull()
    expect(validateDecorationChoice(method, position, { print_width_mm: 1800, print_height_mm: 160 })).toContain("exceed")
    expect(validateDecorationChoice(method, position, { print_width_mm: 180, print_height_mm: 1600 })).toContain("exceed")
  })

  it("adds saved per-colour guides without a re-import, changing sizes or leaking supplier URLs", async () => {
    const skus = ["99164-104", "99164-123"]
    const source = {
      supplier_id: "stricker", cost_by_sku: {},
      catalog_document: { variants: skus.map((sku) => ({ sku, color: sku.endsWith("104") ? "Blue" : "Light grey" })) },
      decoration_options: [{ id: "PDP1", positions: [{ id: "umbrella-panel-1", name: "Panel 1", max_width_mm: 200, max_height_mm: 120, images: [{ url: "/media/generic" }] }], price_breaks: [] }],
    }
    const service = {
      listMemberships: jest.fn().mockResolvedValue([{ organization_id: "org" }]),
      listPublishedProductSources: jest.fn().mockResolvedValue([source]),
      listSuppliers: jest.fn().mockResolvedValue([{ id: "stricker", code: "stricker" }]),
      listPricingRules: jest.fn().mockResolvedValue([]),
      listFacetMappings: jest.fn().mockResolvedValue([]),
      listRawSupplierRecords: jest.fn().mockResolvedValue(skus.map((sku) => ({ payload: { Reference: sku, Component1: "Umbrella", Location1: "Panel 1", Area1Image: `${sku}.png` } }))),
    }
    const query = { graph: async () => ({ data: [{ id: "p", sales_channels: [{ name: "MerchPortal Malta" }], variants: skus.map((sku, index) => ({ id: `v${index}`, sku, prices: [{ currency_code: "eur", amount: 2 }] })) }] }) }
    const req = { params: { id: "p" }, auth_context: { actor_id: "client" }, scope: { resolve: (key: string) => key === ContainerRegistrationKeys.QUERY ? query : service } }
    const res = { json: jest.fn() }
    await GET(req as any, res as any)
    expect(service.listRawSupplierRecords).toHaveBeenCalledWith({ supplier_id: "stricker", record_type: "product", external_id: skus }, { take: 2, select: ["payload"] })
    const position = res.json.mock.calls[0][0].product.decoration_options[0].positions[0]
    expect(position).toMatchObject({ max_width_mm: 200, max_height_mm: 120, images: expect.arrayContaining(skus.map((sku) => ({ variant_sku: sku, url: `/media/${supplierImageToken(`https://cdn.hideacontent.com/public/printings/printinglines/500x500/${sku}.png`)}` }))) })
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("cdn.hideacontent.com")
    expect(source.decoration_options[0].positions[0].images).toEqual([{ url: "/media/generic" }])
  })
})
