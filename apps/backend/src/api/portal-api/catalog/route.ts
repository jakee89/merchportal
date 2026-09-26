import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { sellingPrice } from "../../../modules/merchportal/catalog-rules"
import { markupForQuantity } from "../../../workflows/manage-pricing-rules"
import { cachePortalCatalogResponse, portalCatalogCache, portalCatalogResponseCache, removeExpiredPortalCatalogCacheEntries } from "../../../modules/merchportal/catalog-cache"
import { catalogFacets, colorLabel, matchesCatalogFilters, matchingCatalogVariants, type CatalogFilters } from "../../../modules/merchportal/catalog-filtering"
import { makitoDocumentCategories } from "../../../modules/merchportal/makito-categories"

const catalogSourceFields = ["id", "product_id", "supplier_id", "catalog_preview", "cost_by_sku"]

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

  const [rules, suppliers, completedJobs] = await Promise.all([
    service.listPricingRules({ status: "active" }),
    service.listSuppliers({}),
    service.listImportJobs({ status: "completed" }, { take: 100, order: { completed_at: "DESC" } }),
  ])
  const rulesByScope = new Map<string, any>(rules.map((rule: any) => [rule.scope_key, rule]))
  const supplierCodes = new Map<string, string>(suppliers.map((supplier: any) => [supplier.id, supplier.code]))
  const ruleForSource = (source: any) => rulesByScope.get(`organization:${membership[0].organization_id}`) || rulesByScope.get(`supplier:${supplierCodes.get(source?.supplier_id)}`) || rulesByScope.get("global")
  const latestChange = completedJobs.find((job: any) => job.log?.catalog_refreshed === true || (job.log?.catalog_refreshed === undefined && (job.created_count > 0 || job.updated_count > 0)))
  const cacheKey = `${JSON.stringify(rules.map((rule: any) => [rule.scope_key, rule.markup_percentage, rule.quantity_tiers]))}:${latestChange?.id || "initial"}`
  removeExpiredPortalCatalogCacheEntries()
  const cached = portalCatalogCache.get(cacheKey)
  let safeProducts: any[]
  if (cached && cached.expires > Date.now()) {
    safeProducts = cached.products
  } else {
    const indexedSources = await service.listPublishedProductSources({}, { take: 50000, select: catalogSourceFields })
    const indexed = indexedSources.filter((source: any) => source.catalog_preview)
    if (indexed.length && indexed.length === indexedSources.length) {
      safeProducts = indexed.map((source: any) => {
        const document = source.catalog_preview as any
        const makitoCategories = supplierCodes.get(source.supplier_id) === "makito" ? makitoDocumentCategories(document) : null
        const costs = (source.cost_by_sku || {}) as Record<string, number>
        const rule = ruleForSource(source)
        const variants = (document.variants || []).map((variant: any) => {
          const cost = variant.sku && costs[variant.sku] !== undefined ? Number(costs[variant.sku]) : undefined
          return {
            ...variant,
            price_eur: cost !== undefined && Number.isFinite(cost) ? sellingPrice(cost, markupForQuantity(rule)) : undefined,
            price_breaks: Array.isArray(variant.price_breaks)
              ? variant.price_breaks.map((price: any) => ({ quantity: price.quantity, price_eur: sellingPrice(Number(price.price_eur), markupForQuantity(rule, Number(price.quantity))) }))
              : [],
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        return {
          id: document.id,
          supplier_code: supplierCodes.get(source.supplier_id),
          name: document.name,
          description: document.short_description || document.description,
          sku: variants[0]?.sku,
          image_url: document.image_url,
          category: makitoCategories?.primary.at(-1) || document.category,
          category_hierarchy: makitoCategories?.levels.length ? makitoCategories.levels : document.category_hierarchy || [document.category].filter(Boolean),
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
          color_options: variants.filter((variant: any) => variant.color).map((variant: any) => ({ name: variant.color, color_hex: variant.color_hex, image_url: variant.images?.[0], sku: variant.sku, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity, next_arrival: variant.future_stock?.[0] })),
          filter_variants: variants.map((variant: any) => ({ sku: variant.sku, color: variant.color, color_group: variant.color_group, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity })),
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
        const markup = markupForQuantity(ruleForSource(source))
        const document = source?.catalog_document || {}
        const makitoCategories = supplierCodes.get(source?.supplier_id) === "makito" ? makitoDocumentCategories(document) : null
        const costs = (source?.cost_by_sku || {}) as Record<string, number>
        const variants = (product.variants || []).map((variant: any) => {
          const nativePrice = (variant.prices || []).find((price: any) => price.currency_code === "eur")?.amount
          const fallbackPrice = Number(nativePrice)
          const cost = variant.sku ? Number(costs[variant.sku]) : undefined
          const colors = (variant.options || []).filter((option: any) => option.option?.title === "Color").map((option: any) => option.value)
          const indexedVariant = (document.variants || []).find((item: any) => item.sku === variant.sku)
          return {
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            stock_quantity: Number.isFinite(indexedVariant?.stock_quantity) ? indexedVariant.stock_quantity : variant.inventory_quantity,
            future_stock: indexedVariant?.future_stock || [],
            price_eur: Number.isFinite(cost) ? sellingPrice(cost as number, markup) : Number.isFinite(fallbackPrice) ? fallbackPrice : undefined,
            colors,
            color: indexedVariant?.color || colors[0],
            color_group: indexedVariant?.color_group,
            color_hex: indexedVariant?.color_hex,
            images: indexedVariant?.images || [],
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        const stock = variants.map((variant: any) => Number(variant.stock_quantity)).filter(Number.isFinite)
        return {
          id: product.id,
          supplier_code: supplierCodes.get(source?.supplier_id),
          name: product.title,
          description: source?.catalog_document?.short_description || product.description,
          sku: variants[0]?.sku,
          image_url: product.thumbnail || product.images?.[0]?.url || null,
          category: makitoCategories?.primary.at(-1) || product.categories?.[0]?.name,
          category_hierarchy: makitoCategories?.levels.length ? makitoCategories.levels : document.category_hierarchy || [product.categories?.[0]?.name].filter(Boolean),
          colors: [...new Set(variants.map((variant: any) => variant.color_group || variant.color).filter(Boolean))],
          materials: document.materials || [],
          brand: document.brand,
          keywords: document.keywords || [],
          filter_variants: variants.map((variant: any) => ({ sku: variant.sku, color: variant.color, color_group: variant.color_group, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity })),
          color_option_count: new Set(variants.map((variant: any) => variant.color).filter(Boolean)).size,
          color_options: variants.filter((variant: any) => variant.color).map((variant: any) => ({ name: variant.color, color_hex: variant.color_hex, image_url: variant.images?.[0], sku: variant.sku, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity, next_arrival: variant.future_stock?.[0] })),
          price_eur: prices.length ? Math.min(...prices) : undefined,
          stock_quantity: stock.length ? stock.reduce((total: number, amount: number) => total + amount, 0) : undefined,
          lead_time: source?.lead_time || undefined,
          sustainable: Boolean(source?.sustainable),
          print_methods: Array.isArray(source?.print_methods) ? source.print_methods : [],
        }
      })
    }

    portalCatalogCache.set(cacheKey, {
      expires: Date.now() + 10 * 60_000,
      products: safeProducts,
    })
  }
  const filters: CatalogFilters = {
    search: queryText(req.query.q),
    categories: queryValues(req.query.category),
    colors: queryValues(req.query.color),
    materials: queryValues(req.query.material),
    brands: queryValues(req.query.brand),
    leadTimes: queryValues(req.query.lead_time),
    printMethods: queryValues(req.query.print_method),
    minPrice: queryNumber(req.query.min_price),
    maxPrice: queryNumber(req.query.max_price),
    inStock: req.query.in_stock === "true",
    sustainable: req.query.sustainable === "true",
  }
  const responseKey = `${cacheKey}:${JSON.stringify(req.query)}`
  const cachedResponse = portalCatalogResponseCache.get(responseKey)
  if (cachedResponse && cachedResponse.expires > Date.now()) return res.json(cachedResponse.response)
  const facets = catalogFacets(safeProducts, filters)
  const filtered = safeProducts.filter((product) => matchesCatalogFilters(product, filters))
  const sort = queryText(req.query.sort)
  const sortedPrices = sort === "price_asc" || sort === "price_desc"
    ? new Map(filtered.map((product) => {
      const prices = matchingCatalogVariants(product, filters).map((variant) => variant.price_eur).filter((price): price is number => typeof price === "number" && Number.isFinite(price))
      return [product, prices.length ? Math.min(...prices) : undefined] as const
    }))
    : undefined
  filtered.sort((left, right) => {
    if (sort === "price_asc") return (sortedPrices?.get(left) ?? Number.POSITIVE_INFINITY) - (sortedPrices?.get(right) ?? Number.POSITIVE_INFINITY)
    if (sort === "price_desc") return (sortedPrices?.get(right) ?? Number.NEGATIVE_INFINITY) - (sortedPrices?.get(left) ?? Number.NEGATIVE_INFINITY)
    if (sort === "name_asc") return left.name.localeCompare(right.name)
    if (sort === "name_desc") return right.name.localeCompare(left.name)
    return String(left.name).localeCompare(String(right.name))
  })
  const pageSize = Math.max(12, Math.min(48, Math.floor(queryNumber(req.query.page_size) || 24)))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Math.floor(queryNumber(req.query.page) || 1)))
  const products = filtered.slice((page - 1) * pageSize, page * pageSize).map(({ filter_variants, color_options, ...product }) => {
    const eligibleSkus = new Set(matchingCatalogVariants({ ...product, filter_variants }, filters).map((variant) => variant.sku))
    const score = (option: any) => Number(eligibleSkus.has(option.sku)) * 2 + Number(filters.colors.some((color) => colorLabel(option.name).toLowerCase() === colorLabel(color).toLowerCase()))
    const seenColors = new Set<string>()
    const options = [...(color_options || [])].sort((left: any, right: any) => score(right) - score(left)).filter((option: any) => {
      const color = colorLabel(option.name).toLowerCase()
      if (seenColors.has(color)) return false
      seenColors.add(color)
      return true
    }).slice(0, 12)
    return { ...product, color_options: options }
  })
  const response = {
    products,
    facets,
    total: filtered.length,
    page,
    page_size: pageSize,
    page_count: pageCount,
  }
  cachePortalCatalogResponse(responseKey, response)
  res.json(response)
}
