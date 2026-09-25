import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { markedUpUnitPrice, sellingPrice } from "../modules/merchportal/catalog-rules"
import { decorationPrice, validateDecorationChoice, type DecorationMethod } from "../modules/merchportal/decoration"
import { markupForQuantity, resolveMarkupRule } from "./manage-pricing-rules"
import { addConfigurationToCart } from "./quote-cart"
import { verifyArtwork } from "../modules/merchportal/artwork-proof"

type DecorationInput = {
  branding_method: string
  print_position: string
  print_colours?: number
  print_stitches?: number
  pricing_code?: string
  print_width_mm?: number
  print_height_mm?: number
}

type Input = {
  preview_only?: boolean
  actor_id: string
  product_id: string
  variant_id: string
  quantity: number
  color: string
  branding_method?: string
  print_position?: string
  print_colours?: number
  print_stitches?: number
  pricing_code?: string
  print_width_mm?: number
  print_height_mm?: number
  decorations?: DecorationInput[]
  artwork_file_id?: string
  artwork_filename?: string
  artwork_proof?: string
}

const saveConfigurationStep = createStep("save-configuration", async (input: Input, { container }) => {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships({ actor_id: input.actor_id, actor_type: "customer", status: "active" }, { take: 1 })
  if (!memberships.length) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Active company membership required")
  if (!input.preview_only && memberships[0].role === "client_viewer") throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Your account can view products but cannot add items to a quote")
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quantity must be between 1 and 100,000")
  if (!input.preview_only && (input.artwork_file_id || input.artwork_filename || input.artwork_proof)) verifyArtwork(input.artwork_proof, input.artwork_file_id, input.artwork_filename, input.actor_id, memberships[0].organization_id)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "variants.id", "variants.sku", "variants.prices.amount", "variants.prices.currency_code"], filters: { id: input.product_id } })
  const variant = products[0]?.variants?.find((item: any) => item.id === input.variant_id) as any
  if (!variant) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product option no longer exists")
  const sources = await service.listPublishedProductSources({ product_id: input.product_id }, { take: 1 })
  if (!sources.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product configuration is unavailable")
  const source = sources[0]
  const methods = (Array.isArray(source.decoration_options) ? source.decoration_options : []) as DecorationMethod[]
  const requested: DecorationInput[] = input.decorations?.length
    ? input.decorations
    : input.branding_method && input.print_position
      ? [{ branding_method: input.branding_method, print_position: input.print_position, print_colours: input.print_colours, print_stitches: input.print_stitches, pricing_code: input.pricing_code, print_width_mm: input.print_width_mm, print_height_mm: input.print_height_mm }]
      : []
  const indexedVariant = ((source.catalog_document as any)?.variants || []).find((item: any) => item.sku === variant.sku)
  const priceBreaks = Array.isArray(indexedVariant?.price_breaks) ? indexedVariant.price_breaks : []
  const nativePrice = Number(variant.prices?.find((item: any) => item.currency_code === "eur")?.amount)
  const supplier = (await service.listSuppliers({ id: source.supplier_id }, { take: 1 }))[0]
  const rule = await resolveMarkupRule(service, memberships[0].organization_id, supplier?.code)

  const usedPositions = new Set<string>()
  const validatedLines = requested.map((line) => {
    const method = methods.find((item) => item.id === line.branding_method)
    if (!method) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available branding method")
    const position = method.positions.find((item) => item.id === line.print_position)
    if (!position) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available print position")
    if (usedPositions.has(position.id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Each print position can only be selected once")
    usedPositions.add(position.id)
    const validationError = validateDecorationChoice(method, position, line)
    if (validationError) throw new MedusaError(MedusaError.Types.INVALID_DATA, validationError)
    return { line, method, position }
  })
  const calculate = (quantity: number) => {
    const markup = markupForQuantity(rule, quantity)
    const selectedCost = [...priceBreaks].filter((item: any) => Number(item.quantity) <= quantity).sort((left: any, right: any) => Number(right.quantity) - Number(left.quantity))[0]?.price_eur
    const cost = Number(selectedCost ?? (source.cost_by_sku || {})[String(variant.sku || "")])
    const knownBaseUnitPrice = priceBreaks.length && selectedCost === undefined ? undefined : Number.isFinite(cost) ? markedUpUnitPrice(cost, markup) : nativePrice
    const basePricePending = knownBaseUnitPrice === undefined || !Number.isFinite(knownBaseUnitPrice) || knownBaseUnitPrice <= 0
    const baseUnitPrice = basePricePending ? 0 : (knownBaseUnitPrice ?? 0)
    const decorationLines = validatedLines.map(({ line, method, position }) => {
      const price = decorationPrice(method, quantity, { colours: line.print_colours, stitches: line.print_stitches, width_mm: line.print_width_mm, height_mm: line.print_height_mm, color_code: indexedVariant?.color_code, pricing_code: line.pricing_code, handling_price_eur: position.handling_price_eur })
      return { ...line, method_name: method.name, position_name: position.name, unit_price_eur: price.pending ? null : markedUpUnitPrice(price.unit + price.handling, markup), setup_price_eur: price.pending ? null : sellingPrice(price.setup, markup), price_pending: price.pending }
    })
    const brandingUnitPrice = decorationLines.reduce((sum, line) => sum + (line.unit_price_eur || 0), 0)
    const setupPrice = decorationLines.reduce((sum, line) => sum + (line.setup_price_eur || 0), 0)
    const total = Math.round(((baseUnitPrice + brandingUnitPrice) * quantity + setupPrice) * 100) / 100
    const pricePending = basePricePending || decorationLines.some((line) => line.price_pending)
    return { quantity, baseUnitPrice, brandingUnitPrice, setupPrice, decorationLines, total, pricePending, basePricePending }
  }
  const selected = calculate(input.quantity)
  const { baseUnitPrice, brandingUnitPrice, setupPrice, decorationLines, total, pricePending, basePricePending } = selected
  if (input.preview_only) {
    const breakQuantities = [1, input.quantity, ...priceBreaks.map((item: any) => Number(item.quantity)), ...(Array.isArray(rule.quantity_tiers) ? rule.quantity_tiers.map((tier: any) => Number(tier.min_quantity)) : [])]
    for (const { method } of validatedLines) {
      breakQuantities.push(...(method.price_breaks || []).map((item) => Number(item.quantity)))
      breakQuantities.push(...(method.handling_price_breaks || []).map((item) => Number(item.quantity)))
      for (const range of method.price_ranges || []) breakQuantities.push(...range.price_breaks.map((item) => Number(item.quantity)))
      for (const table of method.price_tables || []) breakQuantities.push(...table.price_breaks.map((item) => Number(item.quantity)))
    }
    const quantities = [...new Set(breakQuantities.filter((quantity) => Number.isInteger(quantity) && quantity >= input.quantity && quantity <= 100000))].sort((a, b) => a - b).slice(0, 12)
    const quantityPrices = quantities.map((quantity) => {
      const price = quantity === input.quantity ? selected : calculate(quantity)
      return { quantity, estimated_total: price.pricePending ? null : price.total, unit_price_eur: price.pricePending ? null : Math.round(price.total / quantity * 100) / 100 }
    })
    return new StepResponse({ id: null, base_unit_price: basePricePending ? null : baseUnitPrice, branding_unit_price: pricePending ? null : brandingUnitPrice, setup_price: pricePending ? null : setupPrice, estimated_total: pricePending ? null : total, branding_price_pending: pricePending, decoration_lines: decorationLines, quantity_prices: quantityPrices, status: "preview" })
  }
  const currentCart = (await service.listQuoteRequests({ organization_id: memberships[0].organization_id, status: "cart" }, { take: 1 }))[0]
  if (Array.isArray(currentCart?.item_ids) && currentCart.item_ids.length >= 50) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart limit is 50 configured products")
  const first = decorationLines[0]
  const configuration = await service.createProductConfigurations({
    organization_id: memberships[0].organization_id,
    actor_id: input.actor_id,
    product_id: input.product_id,
    variant_id: input.variant_id,
    quantity: input.quantity,
    color: input.color,
    branding_method: first?.branding_method || null,
    print_position: first?.print_position || null,
    print_colours: first?.print_colours || null,
    print_width_mm: first?.print_width_mm || null,
    print_height_mm: first?.print_height_mm || null,
    decoration_lines: decorationLines,
    artwork_file_id: input.artwork_file_id || null,
    artwork_filename: input.artwork_filename || null,
    base_unit_price: baseUnitPrice,
    branding_unit_price: brandingUnitPrice,
    setup_price: setupPrice,
    estimated_total: total,
    branding_price_pending: pricePending,
    status: pricePending || (!input.artwork_file_id && decorationLines.length) ? "draft" : "ready",
  })
  await addConfigurationToCart(service, memberships[0].organization_id, input.actor_id, configuration.id)
  return new StepResponse({ id: configuration.id, base_unit_price: basePricePending ? null : baseUnitPrice, branding_unit_price: pricePending ? null : brandingUnitPrice, setup_price: pricePending ? null : setupPrice, estimated_total: pricePending ? null : total, branding_price_pending: pricePending, decoration_lines: decorationLines, status: configuration.status })
})

export const saveProductConfigurationWorkflow = createWorkflow("save-product-configuration", (input: Input) => new WorkflowResponse(saveConfigurationStep(input)))
