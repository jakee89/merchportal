import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { customerQuoteContext } from "../../auth"
import { removeConfigurationFromCart } from "../../../../../workflows/quote-cart"
import { MedusaError } from "@medusajs/framework/utils"
import { saveProductConfigurationWorkflow } from "../../../../../workflows/save-product-configuration"

async function editableItem(req: AuthenticatedMedusaRequest, write = false) {
  const context = await customerQuoteContext(req, write)
  const cart = (await context.service.listQuoteRequests({ organization_id: context.membership.organization_id, status: "cart" }, { take: 1 }))[0]
  const item = cart?.item_ids?.includes(req.params.id) ? (await context.service.listProductConfigurations({ id: req.params.id, organization_id: context.membership.organization_id }, { take: 1 }))[0] : null
  if (!item) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart item not found")
  return { ...context, item }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { item } = await editableItem(req)
  res.json({ configuration: { id: item.id, product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity, has_artwork: Boolean(item.artwork_file_id || item.artwork_files?.length), decorations: (item.decoration_lines || []).map((line: any) => ({ branding_method: line.branding_method, print_position: line.print_position, pricing_code: line.pricing_code, print_colours: line.print_colours, print_stitches: line.print_stitches, print_width_mm: line.print_width_mm, print_height_mm: line.print_height_mm })) } })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { actorId, item } = await editableItem(req, true)
  const { result } = await saveProductConfigurationWorkflow(req.scope).run({ input: { actor_id: actorId!, duplicate_configuration_id: item.id, product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity, color: item.color, decorations: item.decoration_lines || [] } })
  res.status(201).json({ configuration: result })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership } = await customerQuoteContext(req, true)
  const cart = await removeConfigurationFromCart(service, membership.organization_id, req.params.id)
  res.json({ cart: cart.id })
}
