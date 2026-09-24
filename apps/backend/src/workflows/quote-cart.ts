import { MedusaError } from "@medusajs/framework/utils"

function ids(quote: any): string[] {
  return Array.isArray(quote?.item_ids) ? quote.item_ids.filter((id: unknown): id is string => typeof id === "string") : []
}

export async function quoteWithItems(service: any, quote: any) {
  const itemIds = ids(quote)
  const configurations = itemIds.length ? await service.listProductConfigurations({ id: itemIds }, { take: 50 }) : []
  const byId = new Map<string, any>(configurations.map((item: any) => [item.id, item]))
  const products = [...new Set(configurations.map((item: any) => item.product_id))]
  const sources = products.length ? await service.listPublishedProductSources({ product_id: products }, { take: 50 }) : []
  const sourceByProduct = new Map<string, any>(sources.map((source: any) => [source.product_id, source]))
  const items = itemIds.flatMap((id) => {
    const item = byId.get(id)
    if (!item) return []
    const document = sourceByProduct.get(item.product_id)?.catalog_document || {}
    return [{
      id: item.id,
      product_id: item.product_id,
      product_name: document.name || "Product",
      image_url: document.images?.[0] || document.image_url,
      color: item.color,
      quantity: item.quantity,
      decorations: Array.isArray(item.decoration_lines) ? item.decoration_lines.map((line: any) => ({ method_name: line.method_name, position_name: line.position_name, price_pending: Boolean(line.price_pending) })) : [],
      artwork_filename: item.artwork_filename,
      estimated_total: item.branding_price_pending ? null : item.estimated_total,
      quote_required: Boolean(item.branding_price_pending),
    }]
  })
  return {
    id: quote.id,
    organization_id: quote.organization_id,
    status: quote.status,
    customer_note: quote.customer_note,
    staff_note: quote.staff_note,
    estimated_total: items.length && items.every((item) => !item.quote_required) ? Math.round(items.reduce((sum, item) => sum + Number(item.estimated_total || 0), 0) * 100) / 100 : null,
    final_total: quote.final_total,
    created_at: quote.created_at,
    submitted_at: quote.submitted_at,
    quoted_at: quote.quoted_at,
    items,
  }
}

export async function addConfigurationToCart(service: any, organizationId: string, actorId: string, configurationId: string) {
  const carts = await service.listQuoteRequests({ organization_id: organizationId, status: "cart" }, { take: 1 })
  let cart = carts[0]
  if (!cart) {
    try {
      cart = await service.createQuoteRequests({ organization_id: organizationId, actor_id: actorId, item_ids: [configurationId], status: "cart" })
    } catch (error) {
      cart = (await service.listQuoteRequests({ organization_id: organizationId, status: "cart" }, { take: 1 }))[0]
      if (!cart) throw error
    }
  }
  if (!ids(cart).includes(configurationId)) {
    if (ids(cart).length >= 50) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart limit is 50 configured products")
    cart = await service.updateQuoteRequests({ id: cart.id, item_ids: [...ids(cart), configurationId] })
  }
  return cart
}

export async function removeConfigurationFromCart(service: any, organizationId: string, configurationId: string) {
  const cart = (await service.listQuoteRequests({ organization_id: organizationId, status: "cart" }, { take: 1 }))[0]
  if (!cart || !ids(cart).includes(configurationId)) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart item not found")
  return service.updateQuoteRequests({ id: cart.id, item_ids: ids(cart).filter((id) => id !== configurationId) })
}

export async function submitQuoteCart(service: any, organizationId: string, note: string) {
  const cart = (await service.listQuoteRequests({ organization_id: organizationId, status: "cart" }, { take: 1 }))[0]
  if (!cart || !ids(cart).length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add at least one product before requesting a quote")
  const summary = await quoteWithItems(service, cart)
  if (summary.items.length !== ids(cart).length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "One or more cart items are unavailable. Remove them and retry")
  return service.updateQuoteRequests({ id: cart.id, status: "submitted", customer_note: note || null, estimated_total: summary.estimated_total, submitted_at: new Date() })
}

export async function finalizeQuote(service: any, quoteId: string, actorId: string, finalTotal: number, note: string) {
  if (!Number.isFinite(finalTotal) || finalTotal < 0) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a valid final total in EUR")
  const quote = await service.retrieveQuoteRequest(quoteId)
  if (quote.status !== "submitted" && quote.status !== "quoted") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only submitted quotes can be priced")
  return service.updateQuoteRequests({ id: quote.id, status: "quoted", final_total: Math.round(finalTotal * 100) / 100, staff_note: note || null, quoted_by: actorId, quoted_at: new Date() })
}
