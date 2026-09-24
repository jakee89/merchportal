import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { sellingPrice } from "../../../modules/merchportal/catalog-rules"
import { resolveMarkup } from "../../../workflows/manage-pricing-rules"
import { portalCatalogCache, removeExpiredPortalCatalogCacheEntries } from "../../../modules/merchportal/catalog-cache"

function queryText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function queryNumber(value: unknown) {
  const text = queryText(value)
  if (!text) return
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function queryValues(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  return values.map((item) => String(item).trim()).filter(Boolean)
}

function facet(items: any[], values: (product: any) => string[]) {
  const counts = new Map<string, number>()
  for (const product of items) {
    for (const value of new Set(values(product).filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => left.value.localeCompare(right.value))
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

  const [markup, completedJobs] = await Promise.all([
    resolveMarkup(service, membership[0].organization_id),
    service.listImportJobs({ status: "completed" }, { take: 1, order: { completed_at: "DESC" } }),
  ])
  const cacheKey = `${markup}:${completedJobs[0]?.id || "initial"}`
  removeExpiredPortalCatalogCacheEntries()
  const cached = portalCatalogCache.get(cacheKey)
  let safeProducts: any[]
  let facets: any
  if (cached && cached.expires > Date.now()) {
    safeProducts = cached.products
    facets = cached.facets
  } else {
    const indexedSources = await service.listPublishedProductSources({}, { take: 50000 })
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
            price_breaks: Array.isArray(variant.price_breaks)
              ? variant.price_breaks.map((price: any) => ({ quantity: price.quantity, price_eur: sellingPrice(Number(price.price_eur), markup) }))
              : [],
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        return {
          id: document.id,
          name: document.name,
          description: document.short_description || document.description,
          sku: variants[0]?.sku,
          image_url: document.image_url,
          category: document.category,
          category_hierarchy: document.category_hierarchy || [document.category].filter(Boolean),
          colors: document.colors || [],
          materials: document.materials || [],
          brand: document.brand,
          lead_time: document.lead_time,
          sustainable: Boolean(document.sustainable),
          print_methods: document.print_methods || [],
          keywords: document.keywords || [],
          price_eur: prices.length ? Math.min(...prices) : undefined,
          max_price_eur: prices.length ? Math.max(...prices) : undefined,
          stock_quantity: document.stock_quantity,
          color_option_count: new Set(variants.map((variant: any) => variant.color).filter(Boolean)).size,
          color_options: variants.reduce((items: any[], variant: any) => {
            const color = variant.color
            if (!color || items.some((item) => item.name === color)) return items
            items.push({ name: color, color_hex: variant.color_hex, image_url: variant.images?.[0], sku: variant.sku, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity })
            return items
          }, []).slice(0, 12),
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
          description: source?.catalog_document?.short_description || product.description,
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
      categories: facet(safeProducts, (product) => product.category_hierarchy || [product.category]),
      colors: facet(safeProducts, (product) => product.colors || []),
      materials: facet(safeProducts, (product) => product.materials || []),
      brands: facet(safeProducts, (product) => [product.brand]),
      lead_times: facet(safeProducts, (product) => [product.lead_time]),
      print_methods: facet(safeProducts, (product) => product.print_methods || []),
    }
    portalCatalogCache.set(cacheKey, {
      expires: Date.now() + 60_000,
      products: safeProducts,
      facets,
    })
  }
  const search = queryText(req.query.q).toLowerCase()
  const categories = queryValues(req.query.category)
  const colors = queryValues(req.query.color)
  const materials = queryValues(req.query.material)
  const brands = queryValues(req.query.brand)
  const leadTimes = queryValues(req.query.lead_time)
  const printMethods = queryValues(req.query.print_method)
  const minPrice = queryNumber(req.query.min_price)
  const maxPrice = queryNumber(req.query.max_price)
  const inStock = req.query.in_stock === "true"
  const sustainable = req.query.sustainable === "true"
  const filtered = safeProducts.filter((product) => {
    if (search && !`${product.name} ${product.description || ""} ${product.sku || ""} ${(product.keywords || []).join(" ")}`.toLowerCase().includes(search)) return false
    if (categories.length && !categories.some((category) => (product.category_hierarchy || [product.category]).includes(category))) return false
    if (colors.length && !colors.some((color) => product.colors.includes(color))) return false
    if (materials.length && !materials.some((material) => (product.materials || []).includes(material))) return false
    if (brands.length && !brands.includes(product.brand)) return false
    if (leadTimes.length && !leadTimes.includes(product.lead_time)) return false
    if (printMethods.length && !printMethods.some((method) => product.print_methods.includes(method))) return false
    if (minPrice !== undefined && (product.price_eur === undefined || product.price_eur < minPrice)) return false
    if (maxPrice !== undefined && (product.price_eur === undefined || product.price_eur > maxPrice)) return false
    if (inStock && !(product.stock_quantity && product.stock_quantity > 0)) return false
    if (sustainable && !product.sustainable) return false
    return true
  })
  const sort = queryText(req.query.sort)
  filtered.sort((left, right) => {
    if (sort === "price_asc") return (left.price_eur ?? Number.POSITIVE_INFINITY) - (right.price_eur ?? Number.POSITIVE_INFINITY)
    if (sort === "price_desc") return (right.price_eur ?? Number.NEGATIVE_INFINITY) - (left.price_eur ?? Number.NEGATIVE_INFINITY)
    if (sort === "name_asc") return left.name.localeCompare(right.name)
    if (sort === "name_desc") return right.name.localeCompare(left.name)
    return String(left.name).localeCompare(String(right.name))
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
