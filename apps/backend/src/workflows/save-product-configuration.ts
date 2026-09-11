import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { sellingPrice } from "../modules/merchportal/catalog-rules"
import { decorationPrice, type DecorationMethod } from "../modules/merchportal/decoration"
import { resolveMarkup } from "./manage-pricing-rules"

type Input = {
  actor_id: string
  product_id: string
  variant_id: string
  quantity: number
  color: string
  branding_method?: string
  print_position?: string
  print_colours?: number
  print_width_mm?: number
  print_height_mm?: number
  artwork_file_id?: string
  artwork_filename?: string
}

const saveConfigurationStep = createStep("save-configuration", async (input: Input, { container }) => {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships({ actor_id: input.actor_id, actor_type: "customer", status: "active" }, { take: 1 })
  if (!memberships.length) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Active company membership required")
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quantity must be between 1 and 100,000")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id", "variants.sku", "variants.prices.amount", "variants.prices.currency_code"],
    filters: { id: input.product_id },
  })
  const product = products[0]
  const variant = product?.variants?.find((item: any) => item.id === input.variant_id) as any
  if (!variant) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product option no longer exists")
  const sources = await service.listPublishedProductSources({ product_id: input.product_id }, { take: 1 })
  if (!sources.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product configuration is unavailable")
  const source = sources[0]
  const methods = (Array.isArray(source.decoration_options) ? source.decoration_options : []) as DecorationMethod[]
  const method = input.branding_method ? methods.find((item) => item.id === input.branding_method) : undefined
  if (input.branding_method && !method) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available branding method")
  if (method && input.print_position && !method.positions.some((item) => item.id === input.print_position)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an available print position")
  }
  const position = method?.positions.find((item) => item.id === input.print_position)
  if (input.print_colours && (input.print_colours < 1 || (position?.max_colours && input.print_colours > position.max_colours))) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a valid number of print colours")
  }
  if ((input.print_width_mm && input.print_width_mm < 1) || (input.print_height_mm && input.print_height_mm < 1) || (position?.max_width_mm && input.print_width_mm && input.print_width_mm > position.max_width_mm) || (position?.max_height_mm && input.print_height_mm && input.print_height_mm > position.max_height_mm)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork dimensions exceed the selected print area")
  }
  const cost = Number((source.cost_by_sku || {})[String(variant.sku || "")])
  const nativePrice = Number(variant.prices?.find((item: any) => item.currency_code === "eur")?.amount)
  const markup = await resolveMarkup(service, memberships[0].organization_id)
  const baseUnitPrice = Number.isFinite(cost) ? sellingPrice(cost, markup) : nativePrice
  if (!Number.isFinite(baseUnitPrice)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Price is unavailable for this option")
  const branding = decorationPrice(method, input.quantity, {
    colours: input.print_colours,
    width_mm: input.print_width_mm,
    height_mm: input.print_height_mm,
  })
  const brandingUnitPrice = sellingPrice(branding.unit, markup)
  const setupPrice = sellingPrice(branding.setup, markup)
  const total = Math.round(((baseUnitPrice + brandingUnitPrice) * input.quantity + setupPrice) * 100) / 100
  const configuration = await service.createProductConfigurations({
    organization_id: memberships[0].organization_id,
    actor_id: input.actor_id,
    product_id: input.product_id,
    variant_id: input.variant_id,
    quantity: input.quantity,
    color: input.color,
    branding_method: input.branding_method || null,
    print_position: input.print_position || null,
    print_colours: input.print_colours || null,
    print_width_mm: input.print_width_mm || null,
    print_height_mm: input.print_height_mm || null,
    artwork_file_id: input.artwork_file_id || null,
    artwork_filename: input.artwork_filename || null,
    base_unit_price: baseUnitPrice,
    branding_unit_price: brandingUnitPrice,
    setup_price: setupPrice,
    estimated_total: total,
    branding_price_pending: Boolean(method) && branding.pending,
    status: input.artwork_file_id || !method ? "ready" : "draft",
  })
  return new StepResponse({
    id: configuration.id,
    base_unit_price: baseUnitPrice,
    branding_unit_price: brandingUnitPrice,
    setup_price: setupPrice,
    estimated_total: total,
    branding_price_pending: Boolean(method) && branding.pending,
    status: configuration.status,
  })
})

export const saveProductConfigurationWorkflow = createWorkflow("save-product-configuration", (input: Input) => new WorkflowResponse(saveConfigurationStep(input)))
