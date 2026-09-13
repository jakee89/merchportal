import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { sellingPrice } from "../modules/merchportal/catalog-rules"
import { decorationPrice, type DecorationMethod } from "../modules/merchportal/decoration"
import { resolveMarkup } from "./manage-pricing-rules"

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
}

const saveConfigurationStep = createStep("save-configuration", async (input: Input, { container }) => {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships({ actor_id: input.actor_id, actor_type: "customer", status: "active" }, { take: 1 })
  if (!memberships.length) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Active company membership required")
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quantity must be between 1 and 100,000")
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
  const selectedCost = [...priceBreaks].filter((item: any) => Number(item.quantity) <= input.quantity).sort((left: any, right: any) => Number(right.quantity) - Number(left.quantity))[0]?.price_eur
  const cost = Number(selectedCost ?? (source.cost_by_sku || {})[String(variant.sku || "")])
  const nativePrice = Number(variant.prices?.find((item: any) => item.currency_code === "eur")?.amount)
  const markup = await resolveMarkup(service, memberships[0].organization_id)
  const baseUnitPrice = Number.isFinite(cost) ? sellingPrice(cost, markup) : nativePrice
  if (!Number.isFinite(baseUnitPrice)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Price is unavailable for this option")

  const usedPositions = new Set<string>()
  const decorationLines = requested.map((line) => {
    const method = methods.find((item) => item.id === line.branding_method)
    if (!method) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available branding method")
    const position = method.positions.find((item) => item.id === line.print_position)
    if (!position) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available print position")
    if (usedPositions.has(position.id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Each print position can only be selected once")
    usedPositions.add(position.id)
    if (method.colour_mode !== "spot_colour" && (line.print_colours || 1) !== 1) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This printing technique does not allow a colour-count selection")
    if (line.print_colours && (line.print_colours < 1 || (position.max_colours && line.print_colours > position.max_colours))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a valid number of print colours")
    const sizeOptions = position.size_options || []
    const selectedSize = sizeOptions.find((item) => item.pricing_code === line.pricing_code || item.id === line.pricing_code)
    if (sizeOptions.length && !selectedSize) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available print size")
    if (selectedSize && (selectedSize.width_mm !== line.print_width_mm || selectedSize.height_mm !== line.print_height_mm)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a print size supplied for this technique")
    if ((line.print_width_mm && line.print_width_mm < 1) || (line.print_height_mm && line.print_height_mm < 1) || (position.max_width_mm && line.print_width_mm && line.print_width_mm > position.max_width_mm) || (position.max_height_mm && line.print_height_mm && line.print_height_mm > position.max_height_mm)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork dimensions exceed the selected print area")
    const stitchTables = (method.price_tables || []).filter((table) => table.price_by_stitches && table.max_stitches)
    if (stitchTables.length && (!line.print_stitches || line.print_stitches < 1 || line.print_stitches > Math.max(...stitchTables.map((table) => Number(table.max_stitches))))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a supported stitch count")
    const price = decorationPrice(method, input.quantity, { colours: line.print_colours, stitches: line.print_stitches, width_mm: line.print_width_mm, height_mm: line.print_height_mm, color_code: indexedVariant?.color_code, pricing_code: line.pricing_code, handling_price_eur: position.handling_price_eur })
    if (price.pending) throw new MedusaError(MedusaError.Types.INVALID_DATA, `No supplier printing price is available for ${method.name} at the selected quantity, size and colour count`)
    return { ...line, method_name: method.name, position_name: position.name, unit_price_eur: sellingPrice(price.unit + price.handling, markup), setup_price_eur: sellingPrice(price.setup, markup), price_pending: price.pending }
  })
  const brandingUnitPrice = decorationLines.reduce((sum, line) => sum + line.unit_price_eur, 0)
  const setupPrice = decorationLines.reduce((sum, line) => sum + line.setup_price_eur, 0)
  const total = Math.round(((baseUnitPrice + brandingUnitPrice) * input.quantity + setupPrice) * 100) / 100
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
    branding_price_pending: decorationLines.some((line) => line.price_pending),
    status: input.artwork_file_id || !decorationLines.length ? "ready" : "draft",
  })
  return new StepResponse({ id: configuration.id, base_unit_price: baseUnitPrice, branding_unit_price: brandingUnitPrice, setup_price: setupPrice, estimated_total: total, branding_price_pending: decorationLines.some((line) => line.price_pending), decoration_lines: decorationLines, status: configuration.status })
})

export const saveProductConfigurationWorkflow = createWorkflow("save-product-configuration", (input: Input) => new WorkflowResponse(saveConfigurationStep(input)))
