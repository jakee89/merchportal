import { markupForQuantity, resolveMarkup } from "../../../workflows/manage-pricing-rules"

describe("supplier quantity markup rules", () => {
  const supplierRule = {
    markup_percentage: 30,
    quantity_tiers: [
      { min_quantity: 1, max_quantity: 99, markup_percentage: 40 },
      { min_quantity: 100, max_quantity: null, markup_percentage: 20 },
    ],
  }

  it("uses the matching quantity tier and fallback for uncovered quantities", () => {
    expect(markupForQuantity(supplierRule, 25)).toBe(40)
    expect(markupForQuantity(supplierRule, 250)).toBe(20)
    expect(markupForQuantity({ ...supplierRule, quantity_tiers: [{ min_quantity: 100, max_quantity: null, markup_percentage: 20 }] }, 25)).toBe(30)
  })

  it("does not apply another supplier's tiers", async () => {
    const service = {
      listPricingRules: jest.fn(async (filter: { scope_key: string }) => filter.scope_key === "supplier:stricker" ? [supplierRule] : filter.scope_key === "global" ? [{ markup_percentage: 30 }] : []),
    }
    expect(await resolveMarkup(service, null, 250, "stricker")).toBe(20)
    expect(await resolveMarkup(service, null, 250, "midocean")).toBe(30)
  })

  it("keeps an explicit client markup above supplier tiers", async () => {
    const service = { listPricingRules: jest.fn(async (filter: { scope_key: string }) => filter.scope_key === "organization:client-1" ? [{ markup_percentage: 15 }] : [supplierRule]) }
    expect(await resolveMarkup(service, "client-1", 250, "stricker")).toBe(15)
  })
})
