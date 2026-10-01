import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { cachePortalCatalogFacets, cachePortalCatalogResponse, portalCatalogFacetCache, portalCatalogResponseCache, removeExpiredPortalCatalogCacheEntries } from "../../../modules/merchportal/catalog-cache"
import { catalogFacets, colorLabel, matchesCatalogFilters, matchingCatalogVariants, type CatalogFilters } from "../../../modules/merchportal/catalog-filtering"
import { searchCatalog } from "../../../modules/merchportal/catalog-search"
import { compareSupplierPriority } from "../../../modules/merchportal/supplier-priority"
import { catalogMetadata, catalogRevision } from "../../../modules/merchportal/catalog-data"
import { portalReadCache } from "../../../modules/merchportal/read-cache"
import { preparedCatalog } from "../../../modules/merchportal/catalog-prepared"
import { catalogCandidates } from "../../../modules/merchportal/catalog-index"

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
  const started = performance.now()
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  if (!req.auth_context?.actor_id) return res.status(401).json({ message: "Sign in to view the catalog" })
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

  const revision = await catalogRevision(req.scope)
  const cacheKey = `${membership[0].organization_id}:${revision.source}:${revision.settings}`
  removeExpiredPortalCatalogCacheEntries()
  const responseKey = `${cacheKey}:${JSON.stringify(req.query)}`
  const cachedResponse = portalCatalogResponseCache.get(responseKey)
  if (cachedResponse && cachedResponse.expires > Date.now()) {
    res.setHeader("Server-Timing", `total;dur=${(performance.now() - started).toFixed(1)}`)
    return res.json(cachedResponse.response)
  }
  const { suppliers } = await catalogMetadata(service, revision.settings)
  const metadataMs = performance.now() - started
  const supplierPriorities = new Map<string, number>(suppliers.map((supplier: any) => [supplier.id, supplier.catalog_priority]))
  const safeProducts = await preparedCatalog(req.scope, service, membership[0].organization_id, revision)
  const filters: CatalogFilters = {
    search: queryText(req.query.q),
    categories: queryValues(req.query.category),
    colors: queryValues(req.query.color),
    sizes: queryValues(req.query.size),
    materials: queryValues(req.query.material),
    brands: queryValues(req.query.brand),
    leadTimes: queryValues(req.query.lead_time),
    printMethods: queryValues(req.query.print_method),
    minPrice: queryNumber(req.query.min_price),
    maxPrice: queryNumber(req.query.max_price),
    inStock: req.query.in_stock === "true",
    outOfStock: req.query.out_of_stock === "true",
    sustainable: req.query.sustainable === "true",
  }
  const catalogMs = performance.now() - started - metadataMs
  let searchScores: Map<string, number> | undefined
  if (filters.search) {
    searchScores = await searchCatalog(req.scope, safeProducts, filters.search, cacheKey)
    filters.searchMatches = new Set(searchScores.keys())
  }
  const facetKey = `${cacheKey}:${JSON.stringify({ ...filters, searchMatches: undefined })}:${searchScores ? "indexed" : "literal"}`
  const cachedFacets = portalCatalogFacetCache.get(facetKey)
  const facets = req.query.view === "products" ? undefined : cachedFacets && cachedFacets.expires > Date.now()
    ? cachedFacets.facets
    : await portalReadCache.get(`facets:${facetKey}`, 10 * 60_000, async () => catalogFacets(catalogCandidates(safeProducts, filters, true), filters))
  if (facets && (!cachedFacets || cachedFacets.expires <= Date.now())) cachePortalCatalogFacets(facetKey, facets)
  const facetsMs = performance.now() - started - metadataMs - catalogMs
  if (req.query.view === "facets") {
    const response = { facets: req.query.compact === "true"
      ? Object.fromEntries(Object.entries(facets!).map(([key, value]) => [key, Array.isArray(value) ? value.map((item: any) => [item.value, item.count]) : value]))
      : facets }
    cachePortalCatalogResponse(responseKey, response)
    res.setHeader("Server-Timing", `metadata;dur=${metadataMs.toFixed(1)},catalog;dur=${catalogMs.toFixed(1)},facets;dur=${facetsMs.toFixed(1)},total;dur=${(performance.now() - started).toFixed(1)}`)
    return res.json(response)
  }
  const filtered = catalogCandidates(safeProducts, filters).filter((product) => matchesCatalogFilters(product, filters)) as any[]
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
    const priorityDifference = compareSupplierPriority(left.supplier_id, right.supplier_id, supplierPriorities)
    if (priorityDifference) return priorityDifference
    if (filters.search && searchScores) {
      const score = (product: any) => {
        const term = filters.search.toLocaleLowerCase()
        const name = String(product.name).toLocaleLowerCase()
        const skus = (product.filter_variants || []).map((variant: any) => String(variant.sku || "").toLocaleLowerCase())
        return (skus.includes(term) ? 1000 : 0) + (name === term ? 500 : name.startsWith(term) ? 100 : name.includes(term) ? 25 : 0) + (searchScores.get(product.id) || 0)
      }
      const difference = score(right) - score(left)
      if (difference) return difference
    }
    return String(left.name).localeCompare(String(right.name))
  })
  const pageSize = Math.max(12, Math.min(48, Math.floor(queryNumber(req.query.page_size) || 24)))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.max(1, Math.min(pageCount, Math.floor(queryNumber(req.query.page) || 1)))
  const products = filtered.slice((page - 1) * pageSize, page * pageSize).map(({ filter_variants, color_options, supplier_id, search_text, ...product }) => {
    const eligibleSkus = new Set(matchingCatalogVariants({ ...product, filter_variants }, filters).map((variant) => variant.sku))
    const score = (option: any) => Number(eligibleSkus.has(option.sku)) * 2 + Number(filters.colors.some((color) => colorLabel(option.name).toLowerCase() === colorLabel(color).toLowerCase()))
    const seenColors = new Set<string>()
    const options = [...(color_options || [])].sort((left: any, right: any) => score(right) - score(left)).filter((option: any) => {
      const color = colorLabel(option.name).toLowerCase()
      if (seenColors.has(color)) return false
      seenColors.add(color)
      return true
    }).slice(0, 12)
    if (req.query.compact !== "true") return { ...product, color_options: options }
    // Only fields rendered by CatalogCard. Search/filter metadata stays server-side.
    const { id, supplier_code, name, description, sku, image_url, category, brand, sustainable, price_eur, price_from_quantity, has_price_tiers, stock_quantity, color_option_count } = product
    return { id, supplier_code, name, description, sku, image_url, category, brand, sustainable, price_eur, price_from_quantity, has_price_tiers, stock_quantity, color_option_count, color_options: options }
  })
  const response = {
    products,
    ...(facets ? { facets } : {}),
    total: filtered.length,
    page,
    page_size: pageSize,
    page_count: pageCount,
  }
  cachePortalCatalogResponse(responseKey, response)
  res.setHeader("Server-Timing", `metadata;dur=${metadataMs.toFixed(1)},catalog;dur=${catalogMs.toFixed(1)},facets;dur=${facetsMs.toFixed(1)},total;dur=${(performance.now() - started).toFixed(1)}`)
  res.json(response)
}
