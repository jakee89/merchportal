import { validateUsageIncrement } from "../portal-usage"

describe("portal usage increments", () => {
  it("accepts bounded sign-ins, views and engaged seconds", () => {
    expect(validateUsageIncrement({ logins: 1 })).toEqual({ logins: 1, page_views: 0, product_views: 0, active_seconds: 0 })
    expect(validateUsageIncrement({ page_views: 1, product_views: 1, active_seconds: 30 })).toEqual({ logins: 0, page_views: 1, product_views: 1, active_seconds: 30 })
  })

  it("rejects inflated, negative and empty updates", () => {
    expect(() => validateUsageIncrement({ page_views: 2 })).toThrow()
    expect(() => validateUsageIncrement({ active_seconds: -1 })).toThrow()
    expect(() => validateUsageIncrement({ product_views: 1 })).toThrow()
    expect(() => validateUsageIncrement({})).toThrow()
  })
})
