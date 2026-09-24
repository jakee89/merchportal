import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { sellingPrice } from "../../../../modules/merchportal/catalog-rules"
import { resolveMarkup } from "../../../../workflows/manage-pricing-rules"
import { saveProductConfigurationWorkflow } from "../../../../workflows/save-product-configuration"

async function context(req: AuthenticatedMedusaRequest) {
  const actorId = req.auth_context?.actor_id
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const memberships = await service.listMemberships({ actor_id: actorId, actor_type: "customer", status: "active" }, { take: 1 })
  if (!actorId || !memberships.length) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Active company membership required")
  return { actorId, service, membership: memberships[0] }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, membership } = await context(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "description", "thumbnail", "images.url", "status", "categories.name", "sales_channels.name", "variants.id", "variants.title", "variants.sku", "variants.inventory_quantity", "variants.prices.amount", "variants.prices.currency_code", "variants.options.value", "variants.options.option.title"],
    filters: { id: req.params.id, status: ProductStatus.PUBLISHED },
  })
  const product = data[0]
  if (!product || !product.sales_channels?.some((item: any) => item.name === "MerchPortal Malta")) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const sources = await service.listPublishedProductSources({ product_id: product.id }, { take: 1 })
  if (!sources.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product configuration unavailable")
  const source = sources[0]
  const catalogDocument = (source.catalog_document || {}) as any
  const currentSkus = new Set((catalogDocument.variants || []).map((variant: any) => variant.sku))
  const markup = await resolveMarkup(service, membership.organization_id)
  const variants = (product.variants || [])
    .filter((variant: any) => !currentSkus.size || currentSkus.has(variant.sku))
    .map((variant: any) => {
      const indexedVariant = (catalogDocument.variants || []).find((item: any) => item.sku === variant.sku)
      const color = indexedVariant?.color || variant.options?.find((item: any) => item.option?.title === "Color")?.value || "Standard"
      const cost = Number((source.cost_by_sku || {})[variant.sku])
      const nativePrice = Number(variant.prices?.find((item: any) => item.currency_code === "eur")?.amount)
      return {
        id: variant.id,
        sku: variant.sku,
        title: indexedVariant?.title || variant.title,
        color,
        size: indexedVariant?.size,
        ean: indexedVariant?.ean,
        pantone: indexedVariant?.pantone,
        dimensions: indexedVariant?.dimensions,
        images: Array.isArray(indexedVariant?.images) ? indexedVariant.images : [],
        stock_quantity: Number.isFinite(indexedVariant?.stock_quantity) ? indexedVariant.stock_quantity : variant.inventory_quantity,
        price_eur: Number.isFinite(cost) ? sellingPrice(cost, markup) : nativePrice,
        price_breaks: Array.isArray(indexedVariant?.price_breaks)
          ? indexedVariant.price_breaks.map((price: any) => ({ quantity: price.quantity, price_eur: sellingPrice(Number(price.price_eur), markup) }))
          : [],
        future_stock: Array.isArray(indexedVariant?.future_stock) ? indexedVariant.future_stock : [],
        color_code: indexedVariant?.color_code,
        color_hex: indexedVariant?.color_hex,
      }
    })
  const decorationOptions = Array.isArray(source.decoration_options)
    ? source.decoration_options.map((method: any) => ({
        ...method,
        positions: Array.isArray(method.positions)
          ? method.positions.map((position: any) => ({
              ...position,
              handling_price_eur: position.handling_price_eur === undefined ? undefined : sellingPrice(Number(position.handling_price_eur) || 0, markup),
            }))
          : [],
        price_breaks: Array.isArray(method.price_breaks)
          ? method.price_breaks.map((price: any) => ({
              quantity: price.quantity,
              unit_price_eur: sellingPrice(Number(price.unit_price_eur) || 0, markup),
              next_colour_price_eur: price.next_colour_price_eur === undefined ? undefined : sellingPrice(Number(price.next_colour_price_eur) || 0, markup),
            }))
          : [],
        price_ranges: Array.isArray(method.price_ranges)
          ? method.price_ranges.map((range: any) => ({
              ...range,
              price_breaks: Array.isArray(range.price_breaks)
                ? range.price_breaks.map((price: any) => ({
                    quantity: price.quantity,
                    unit_price_eur: sellingPrice(Number(price.unit_price_eur) || 0, markup),
                    next_colour_price_eur: price.next_colour_price_eur === undefined ? undefined : sellingPrice(Number(price.next_colour_price_eur) || 0, markup),
                  }))
                : [],
            }))
          : [],
        setup_price_eur: method.setup_price_eur === undefined ? undefined : sellingPrice(Number(method.setup_price_eur) || 0, markup),
        handling_price_breaks: Array.isArray(method.handling_price_breaks)
          ? method.handling_price_breaks.map((price: any) => ({
              quantity: price.quantity,
              unit_price_eur: sellingPrice(Number(price.unit_price_eur) || 0, markup),
            }))
          : [],
        price_tables: Array.isArray(method.price_tables)
          ? method.price_tables.map((table: any) => ({
              ...table,
              price_breaks: Array.isArray(table.price_breaks)
                ? table.price_breaks.map((price: any) => ({
                    quantity: price.quantity,
                    unit_price_eur: sellingPrice(Number(price.unit_price_eur) || 0, markup),
                    next_colour_price_eur: price.next_colour_price_eur === undefined ? undefined : sellingPrice(Number(price.next_colour_price_eur) || 0, markup),
                  }))
                : [],
            }))
          : [],
      }))
    : []
  const relatedSources = await service.listPublishedProductSources({}, { take: 200, order: { updated_at: "DESC" } })
  const related = relatedSources
    .filter((item: any) => item.product_id !== product.id && item.catalog_document?.category === catalogDocument.category)
    .slice(0, 6)
    .map((item: any) => {
      const document = item.catalog_document || {}
      const costs = Object.values(item.cost_by_sku || {}).map(Number).filter(Number.isFinite)
      return {
        id: item.product_id,
        name: document.name,
        image_url: document.image_url,
        price_eur: costs.length ? sellingPrice(Math.min(...costs), markup) : undefined,
      }
    })
  res.json({
    product: {
      id: product.id,
      name: catalogDocument.name || product.title,
      description: catalogDocument.description || product.description,
      short_description: catalogDocument.short_description,
      code: catalogDocument.supplier_product_code || catalogDocument.variants?.[0]?.sku,
      category: catalogDocument.category || product.categories?.[0]?.name,
      category_hierarchy: catalogDocument.category_hierarchy || [catalogDocument.category].filter(Boolean),
      brand: catalogDocument.brand,
      sustainable: Boolean(catalogDocument.sustainable),
      specifications: catalogDocument.specifications || (source.attributes as any)?.specifications || [],
      downloads: (catalogDocument.downloads || []).filter((item: any) => typeof item.url === "string" && item.url.startsWith("/portal/")),
      images: [...(catalogDocument.images || []), product.thumbnail, ...(product.images || []).map((item: any) => item.url)].filter((item, index, all) => item && all.indexOf(item) === index),
      variants,
      decoration_options: decorationOptions,
      related,
    },
  })
}

type Body = {
  preview_only?: boolean
  variant_id?: string
  quantity?: number
  color?: string
  branding_method?: string
  print_position?: string
  print_colours?: number
  print_stitches?: number
  pricing_code?: string
  print_width_mm?: number
  print_height_mm?: number
  artwork_file_id?: string
  artwork_filename?: string
  decorations?: Array<{
    branding_method: string
    print_position: string
    pricing_code?: string
    print_colours?: number
    print_stitches?: number
    print_width_mm?: number
    print_height_mm?: number
  }>
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const { actorId } = await context(req)
  if (!req.body.variant_id || !req.body.color) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a product colour")
  const { result } = await saveProductConfigurationWorkflow(req.scope).run({
    input: {
      actor_id: actorId,
      product_id: req.params.id,
      variant_id: req.body.variant_id,
      quantity: Number(req.body.quantity),
      color: req.body.color,
      branding_method: req.body.branding_method,
      print_position: req.body.print_position,
      print_colours: req.body.print_colours,
      print_stitches: req.body.print_stitches,
      pricing_code: req.body.pricing_code,
      print_width_mm: req.body.print_width_mm,
      print_height_mm: req.body.print_height_mm,
      artwork_file_id: req.body.artwork_file_id,
      artwork_filename: req.body.artwork_filename,
      decorations: req.body.decorations,
      preview_only: Boolean(req.body.preview_only),
    },
  })
  res.status(req.body.preview_only ? 200 : 201).json({ configuration: result })
}
