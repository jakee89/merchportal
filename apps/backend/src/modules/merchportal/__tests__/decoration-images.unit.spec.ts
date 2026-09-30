jest.mock("../related-products", () => ({ relatedProductSources: jest.fn().mockResolvedValue([]) }))

import { GET } from "../../../api/portal-api/products/[id]/route"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { supplierImageToken } from "../media"

describe("existing product decoration images", () => {
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
