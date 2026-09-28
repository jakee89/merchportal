import { lowestPlainProductPrice, lowestProductPrice, plainProductPriceBreaks } from "../plain-pricing"

describe("plain product quantity pricing", () => {
  it("keeps a flat supplier price flat without markup tiers", () => {
    expect(plainProductPriceBreaks(10, [{ quantity: 1, price_eur: 10 }], { markup_percentage: 30 })).toEqual([{ quantity: 1, price_eur: 13 }])
  })

  it("includes saved markup boundaries and uses the lowest actual unit price", () => {
    const breaks = plainProductPriceBreaks(10, [{ quantity: 1, price_eur: 10 }, { quantity: 1000, price_eur: 9 }], {
      markup_percentage: 30,
      quantity_tiers: [{ min_quantity: 250, max_quantity: 999, markup_percentage: 20 }, { min_quantity: 1000, max_quantity: null, markup_percentage: 15 }],
    })
    expect(breaks).toEqual([
      { quantity: 1, price_eur: 13 },
      { quantity: 250, price_eur: 12 },
      { quantity: 1000, price_eur: 10.35 },
    ])
    expect(lowestPlainProductPrice(breaks)).toEqual({ quantity: 1000, price_eur: 10.35 })
  })

  it("respects a supplier minimum quantity and markup tier end", () => {
    expect(plainProductPriceBreaks(10, [{ quantity: 25, price_eur: 10 }], {
      markup_percentage: 30,
      quantity_tiers: [{ min_quantity: 25, max_quantity: 49, markup_percentage: 20 }],
    })).toEqual([{ quantity: 25, price_eur: 12 }, { quantity: 50, price_eur: 13 }])
  })

  it("does not advertise a price available only above the site's quantity limit", () => {
    expect(plainProductPriceBreaks(10, [{ quantity: 200000, price_eur: 7 }], { markup_percentage: 30 })).toEqual([])
  })

  it("prices similar products from the cheapest actual variant tier", () => {
    expect(lowestProductPrice([
      { sku: "first", price_breaks: [{ quantity: 1, price_eur: 10 }] },
      { sku: "second", price_breaks: [{ quantity: 1, price_eur: 12 }, { quantity: 500, price_eur: 7 }] },
    ], { first: 10, second: 12 }, { markup_percentage: 30 })).toEqual({ quantity: 500, price_eur: 9.1, has_price_tiers: true })
  })
})
