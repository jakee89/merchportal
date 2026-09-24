import { addConfigurationToCart, finalizeQuote, quoteWithItems, removeConfigurationFromCart, submitQuoteCart } from "../quote-cart"

describe("quote cart", () => {
  const configuration = { id: "config-1", product_id: "product-1", color: "Blue", quantity: 100, estimated_total: 250, branding_price_pending: false, decoration_lines: [{ method_name: "Pad Printing", position_name: "Front", branding_method: "private-code" }] }

  function service() {
    let cart: any
    return {
      listQuoteRequests: jest.fn(async (filters: any) => cart && cart.organization_id === filters.organization_id && (!filters.status || filters.status === cart.status) ? [cart] : []),
      createQuoteRequests: jest.fn(async (input: any) => { cart = { id: "quote-1", ...input }; return cart }),
      updateQuoteRequests: jest.fn(async (input: any) => { cart = { ...cart, ...input }; return cart }),
      retrieveQuoteRequest: jest.fn(async () => cart),
      listProductConfigurations: jest.fn(async () => [configuration]),
      listPublishedProductSources: jest.fn(async () => [{ product_id: "product-1", catalog_document: { name: "Test pen", image_url: "/media/opaque" } }]),
    }
  }

  it("adds multiple configurations to one cart and removes one without deleting it", async () => {
    const store = service()
    await addConfigurationToCart(store, "company-1", "buyer-1", "config-1")
    const cart = await addConfigurationToCart(store, "company-1", "buyer-1", "config-2")
    expect(cart.item_ids).toEqual(["config-1", "config-2"])
    expect(store.createQuoteRequests).toHaveBeenCalledTimes(1)
    expect((await removeConfigurationFromCart(store, "company-1", "config-2")).item_ids).toEqual(["config-1"])
  })

  it("submits a server-priced cart and excludes supplier technique codes from the client response", async () => {
    const store = service()
    const cart = await addConfigurationToCart(store, "company-1", "buyer-1", "config-1")
    const summary = await quoteWithItems(store, cart)
    expect(summary.estimated_total).toBe(250)
    expect(summary.items[0].decorations).toEqual([{ method_name: "Pad Printing", position_name: "Front", price_pending: false }])
    const submitted = await submitQuoteCart(store, "company-1", "Please deliver in October")
    expect(submitted.status).toBe("submitted")
    expect(submitted.estimated_total).toBe(250)
  })

  it("allows staff to set the final total only after submission", async () => {
    const store = service()
    await addConfigurationToCart(store, "company-1", "buyer-1", "config-1")
    await expect(finalizeQuote(store, "quote-1", "staff-1", 300, "Approved")).rejects.toThrow("Only submitted quotes")
    await submitQuoteCart(store, "company-1", "")
    const final = await finalizeQuote(store, "quote-1", "staff-1", 300, "Approved")
    expect(final.final_total).toBe(300)
    expect(final.status).toBe("quoted")
  })
})
