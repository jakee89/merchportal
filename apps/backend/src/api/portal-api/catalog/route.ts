import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { sellingPrice } from "../../../modules/merchportal/catalog-rules"
import { resolveMarkup } from "../../../workflows/manage-pricing-rules"

const catalogCache = new Map<string, { expires: number; products: any[]; facets: any }>()

function queryText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function queryNumber(value: unknown) {
  const text = queryText(value)
  if (!text) return
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const membership = await service.listMemberships(
    {
      actor_id: req.auth_context?.actor_id,
      actor_type: "customer",
      status: "active",
    },
    { take: 1 },
  )
  if (!membership.length) {
    return res.status(403).json({ message: "Join a company before viewing the catalog" })
  }

  const cacheKey = membership[0].organization_id
  const cached = catalogCache.get(cacheKey)
  let safeProducts: any[]
  let facets: any
  if (cached && cached.expires > Date.now()) {
    safeProducts = cached.products
    facets = cached.facets
  } else {
    const [indexedSources, markup] = await Promise.all([service.listPublishedProductSources({}, { take: 50000 }), resolveMarkup(service, membership[0].organization_id)])
    const indexed = indexedSources.filter((source: any) => source.catalog_document)
    if (indexed.length && indexed.length === indexedSources.length) {
      safeProducts = indexed.map((source: any) => {
        const document = source.catalog_document as any
        const costs = (source.cost_by_sku || {}) as Record<string, number>
        const variants = (document.variants || []).map((variant: any) => {
          const cost = Number(costs[variant.sku])
          return {
            ...variant,
            price_eur: Number.isFinite(cost) ? sellingPrice(cost, markup) : undefined,
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        return {
          ...document,
          sku: variants[0]?.sku,
          price_eur: prices.length ? Math.min(...prices) : undefined,
          variants,
        }
      })
    } else {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "title", "description", "thumbnail", "external_id", "images.url", "categories.name", "sales_channels.name", "variants.id", "variants.title", "variants.sku", "variants.inventory_quantity", "variants.prices.amount", "variants.prices.currency_code", "variants.options.value", "variants.options.option.title"],
        filters: { status: ProductStatus.PUBLISHED },
        pagination: { take: 50000 },
      })
      const nativeProducts = data.filter((product: any) => product.external_id?.startsWith("mp_") && product.sales_channels?.some((channel: any) => channel.name === "MerchPortal Malta"))
      const sources = nativeProducts.length
        ? await service.listPublishedProductSources({
            product_id: nativeProducts.map((product: any) => product.id),
          })
        : []
      const sourceByProduct = new Map<string, any>(sources.map((source: any) => [source.product_id, source]))
      safeProducts = nativeProducts.map((product: any) => {
        const source = sourceByProduct.get(product.id)
        const costs = (source?.cost_by_sku || {}) as Record<string, number>
        const variants = (product.variants || []).map((variant: any) => {
          const nativePrice = (variant.prices || []).find((price: any) => price.currency_code === "eur")?.amount
          const fallbackPrice = Number(nativePrice)
          const cost = variant.sku ? Number(costs[variant.sku]) : undefined
          const colors = (variant.options || []).filter((option: any) => option.option?.title === "Color").map((option: any) => option.value)
          return {
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            stock_quantity: variant.inventory_quantity,
            price_eur: Number.isFinite(cost) ? sellingPrice(cost as number, markup) : Number.isFinite(fallbackPrice) ? fallbackPrice : undefined,
            colors,
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        const stock = variants.map((variant: any) => Number(variant.stock_quantity)).filter(Number.isFinite)
        return {
          id: product.id,
          name: product.title,
          description: product.description,
          sku: variants[0]?.sku,
          image_url: product.thumbnail || product.images?.[0]?.url || null,
          category: product.categories?.[0]?.name,
          colors: [...new Set(variants.flatMap((variant: any) => variant.colors))],
          price_eur: prices.length ? Math.min(...prices) : undefined,
          stock_quantity: stock.length ? stock.reduce((total: number, amount: number) => total + amount, 0) : undefined,
          lead_time: source?.lead_time || undefined,
          sustainable: Boolean(source?.sustainable),
          print_methods: Array.isArray(source?.print_methods) ? source.print_methods : [],
          variants: variants.map(({ colors, ...variant }: any) => variant),
        }
      })
    }

    facets = {
      categories: [...new Set(safeProducts.map((product) => product.category).filter(Boolean))].sort(),
      colors: [...new Set(safeProducts.flatMap((product) => product.colors))].sort(),
      materials: [...new Set(safeProducts.flatMap((product) => product.materials || []))].sort(),
      brands: [...new Set(safeProducts.map((product) => product.brand).filter(Boolean))].sort(),
      lead_times: [...new Set(safeProducts.map((product) => product.lead_time).filter(Boolean))].sort(),
      print_methods: [...new Set(safeProducts.flatMap((product) => product.print_methods))].sort(),
    }
    catalogCache.set(cacheKey, {
      expires: Date.now() + 60_000,
      products: safeProducts,
      facets,
    })
  }
  const search = queryText(req.query.q).toLowerCase()
  const category = queryText(req.query.category)
  const color = queryText(req.query.color)
  const material = queryText(req.query.material)
  const brand = queryText(req.query.brand)
  const leadTime = queryText(req.query.lead_time)
  const printMethod = queryText(req.query.print_method)
  const minPrice = queryNumber(req.query.min_price)
  const maxPrice = queryNumber(req.query.max_price)
  const inStock = req.query.in_stock === "true"
  const sustainable = req.query.sustainable === "true"
  const filtered = safeProducts.filter((product) => {
    if (search && !`${product.name} ${product.description || ""} ${product.sku || ""} ${(product.keywords || []).join(" ")}`.toLowerCase().includes(search)) return false
    if (category && product.category !== category) return false
    if (color && !product.colors.includes(color)) return false
    if (material && !(product.materials || []).includes(material)) return false
    if (brand && product.brand !== brand) return false
    if (leadTime && product.lead_time !== leadTime) return false
    if (printMethod && !product.print_methods.includes(printMethod)) return false
    if (minPrice !== undefined && (product.price_eur === undefined || product.price_eur < minPrice)) return false
    if (maxPrice !== undefined && (product.price_eur === undefined || product.price_eur > maxPrice)) return false
    if (inStock && !(product.stock_quantity && product.stock_quantity > 0)) return false
    if (sustainable && !product.sustainable) return false
    return true
  })
  const pageSize = Math.max(12, Math.min(48, Math.floor(queryNumber(req.query.page_size) || 24)))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Math.floor(queryNumber(req.query.page) || 1)))
  const products = filtered.slice((page - 1) * pageSize, page * pageSize)
  res.json({
    products,
    facets,
    total: filtered.length,
    page,
    page_size: pageSize,
    page_count: pageCount,
  })
}
