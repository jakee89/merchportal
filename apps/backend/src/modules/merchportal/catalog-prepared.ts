import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { lowestPlainProductPrice, plainProductPriceBreaks } from "./plain-pricing"
import { catalogSearchText } from "./catalog-filtering"
import { makitoDocumentCategories } from "./makito-categories"
import { applyFacetMappings, facetMappingIndex } from "./facet-mappings"
import { catalogMetadata, catalogRevision, catalogSources } from "./catalog-data"
import { portalPreparedCatalogCache } from "./read-cache"

type Revision = { source: string; settings: string }
const activeCatalogs = new Map<string, { used: number; warm: () => Promise<unknown> }>()

export async function warmActiveCatalogs() {
  for (const [id, entry] of activeCatalogs) {
    if (Date.now() - entry.used > 15 * 60_000) activeCatalogs.delete(id)
    else await entry.warm()
  }
}

export async function preparedCatalog(container: any, service: any, organizationId: string, revision: Revision, remember = true) {
  const { rules, suppliers, facetMappings } = await catalogMetadata(service, revision.settings)
  if (remember) {
    // Capture shared services, not authentication or request-local state.
    const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const scope = { resolve: (key: string) => key === ContainerRegistrationKeys.PG_CONNECTION ? knex : query }
    if (!activeCatalogs.has(organizationId) && activeCatalogs.size >= 4) activeCatalogs.delete(activeCatalogs.keys().next().value!)
    activeCatalogs.set(organizationId, { used: Date.now(), warm: async () => {
      const latest = await catalogRevision(scope)
      await preparedCatalog(scope, service, organizationId, latest, false)
    } })
  }
  const cacheKey = `${organizationId}:${revision.source}:${revision.settings}`
  return portalPreparedCatalogCache.get<any[]>(cacheKey, 60 * 60_000, async () => {
    const mappingIndex = facetMappingIndex(facetMappings)
    const rulesByScope = new Map<string, any>(rules.map((rule: any) => [rule.scope_key, rule]))
    const supplierCodes = new Map<string, string>(suppliers.map((supplier: any) => [supplier.id, supplier.code]))
    const ruleForSource = (source: any) => rulesByScope.get(`organization:${organizationId}`) || rulesByScope.get(`supplier:${supplierCodes.get(source?.supplier_id)}`) || rulesByScope.get("global")
    let safeProducts: any[]
    const indexedSources = await catalogSources(container, revision.source)
    const indexed = indexedSources.filter((source: any) => source.catalog_preview)
    if (indexed.length && indexed.length === indexedSources.length) {
      safeProducts = indexed.map((source: any) => {
        const document = source.catalog_preview as any
        const makitoCategories = supplierCodes.get(source.supplier_id) === "makito" ? makitoDocumentCategories(document) : null
        const costs = (source.cost_by_sku || {}) as Record<string, number>
        const rule = ruleForSource(source)
        const variants = (document.variants || []).map((variant: any) => {
          const cost = variant.sku && costs[variant.sku] !== undefined ? Number(costs[variant.sku]) : undefined
          const price_breaks = plainProductPriceBreaks(cost, variant.price_breaks, rule)
          const lowest = lowestPlainProductPrice(price_breaks)
          return {
            ...variant,
            price_eur: lowest?.price_eur,
            price_from_quantity: lowest?.quantity,
            has_price_tiers: price_breaks.length > 1,
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        const lowestVariant = variants.find((variant: any) => variant.price_eur === Math.min(...prices))
        return {
          id: document.id,
          supplier_id: source.supplier_id,
          supplier_code: supplierCodes.get(source.supplier_id),
          name: document.name,
          description: document.short_description || document.description,
          sku: variants[0]?.sku,
          image_url: document.image_url,
          category: makitoCategories?.primary.at(-1) || document.category,
          category_hierarchy: makitoCategories?.levels.length ? makitoCategories.levels : document.category_hierarchy || [document.category].filter(Boolean),
          category_paths: makitoCategories?.paths.length ? makitoCategories.paths : [document.category_hierarchy || [document.category].filter(Boolean)],
          colors: document.colors || [],
          materials: document.materials || [],
          brand: document.brand,
          lead_time: document.lead_time,
          sustainable: Boolean(document.sustainable),
          print_methods: document.print_methods || [],
          keywords: document.keywords || [],
          price_eur: prices.length ? Math.min(...prices) : undefined,
          price_from_quantity: lowestVariant?.price_from_quantity,
          has_price_tiers: lowestVariant?.has_price_tiers,
          max_price_eur: prices.length ? Math.max(...prices) : undefined,
          stock_quantity: document.stock_quantity,
          color_option_count: new Set(variants.map((variant: any) => variant.color).filter(Boolean)).size,
          color_options: variants.filter((variant: any) => variant.color).map((variant: any) => ({ name: variant.color, color_hex: variant.color_hex, image_url: variant.images?.[0], sku: variant.sku, price_eur: variant.price_eur, price_from_quantity: variant.price_from_quantity, has_price_tiers: variant.has_price_tiers, stock_quantity: variant.stock_quantity, next_arrival: variant.future_stock?.[0] })),
          filter_variants: variants.map((variant: any) => ({ sku: variant.sku, color: variant.color, color_group: variant.color_group, size: variant.size, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity })),
        }
      })
    } else {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
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
        const rule = ruleForSource(source)
        const document = source?.catalog_document || {}
        const makitoCategories = supplierCodes.get(source?.supplier_id) === "makito" ? makitoDocumentCategories(document) : null
        const costs = (source?.cost_by_sku || {}) as Record<string, number>
        const variants = (product.variants || []).map((variant: any) => {
          const nativePrice = (variant.prices || []).find((price: any) => price.currency_code === "eur")?.amount
          const fallbackPrice = Number(nativePrice)
          const cost = variant.sku ? Number(costs[variant.sku]) : undefined
          const colors = (variant.options || []).filter((option: any) => option.option?.title === "Color").map((option: any) => option.value)
          const indexedVariant = (document.variants || []).find((item: any) => item.sku === variant.sku)
          const priceBreaks = plainProductPriceBreaks(Number.isFinite(cost) ? cost : undefined, indexedVariant?.price_breaks, rule)
          const lowest = lowestPlainProductPrice(priceBreaks)
          return {
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            stock_quantity: Number.isFinite(indexedVariant?.stock_quantity) ? indexedVariant.stock_quantity : variant.inventory_quantity,
            future_stock: indexedVariant?.future_stock || [],
            price_eur: lowest?.price_eur ?? (Number.isFinite(fallbackPrice) ? fallbackPrice : undefined),
            price_from_quantity: lowest?.quantity,
            has_price_tiers: priceBreaks.length > 1,
            colors,
            color: indexedVariant?.color || colors[0],
            color_group: indexedVariant?.color_group,
            size: indexedVariant?.size,
            color_hex: indexedVariant?.color_hex,
            images: indexedVariant?.images || [],
          }
        })
        const prices = variants.map((variant: any) => variant.price_eur).filter(Number.isFinite)
        const lowestVariant = variants.find((variant: any) => variant.price_eur === Math.min(...prices))
        const stock = variants.map((variant: any) => Number(variant.stock_quantity)).filter(Number.isFinite)
        return {
          id: product.id,
          supplier_id: source?.supplier_id,
          supplier_code: supplierCodes.get(source?.supplier_id),
          name: product.title,
          description: source?.catalog_document?.short_description || product.description,
          sku: variants[0]?.sku,
          image_url: product.thumbnail || product.images?.[0]?.url || null,
          category: makitoCategories?.primary.at(-1) || product.categories?.[0]?.name,
          category_hierarchy: makitoCategories?.levels.length ? makitoCategories.levels : document.category_hierarchy || [product.categories?.[0]?.name].filter(Boolean),
          category_paths: makitoCategories?.paths.length ? makitoCategories.paths : [document.category_hierarchy || [product.categories?.[0]?.name].filter(Boolean)],
          colors: [...new Set(variants.map((variant: any) => variant.color_group || variant.color).filter(Boolean))],
          materials: document.materials || [],
          brand: document.brand,
          keywords: document.keywords || [],
          filter_variants: variants.map((variant: any) => ({ sku: variant.sku, color: variant.color, color_group: variant.color_group, size: variant.size, price_eur: variant.price_eur, stock_quantity: variant.stock_quantity })),
          color_option_count: new Set(variants.map((variant: any) => variant.color).filter(Boolean)).size,
          color_options: variants.filter((variant: any) => variant.color).map((variant: any) => ({ name: variant.color, color_hex: variant.color_hex, image_url: variant.images?.[0], sku: variant.sku, price_eur: variant.price_eur, price_from_quantity: variant.price_from_quantity, has_price_tiers: variant.has_price_tiers, stock_quantity: variant.stock_quantity, next_arrival: variant.future_stock?.[0] })),
          price_eur: prices.length ? Math.min(...prices) : undefined,
          price_from_quantity: lowestVariant?.price_from_quantity,
          has_price_tiers: lowestVariant?.has_price_tiers,
          stock_quantity: stock.length ? stock.reduce((total: number, amount: number) => total + amount, 0) : undefined,
          lead_time: source?.lead_time || undefined,
          sustainable: Boolean(source?.sustainable),
          print_methods: Array.isArray(source?.print_methods) ? source.print_methods : [],
        }
      })
    }

    safeProducts = safeProducts.map((product) => {
      const mapped = product.supplier_id ? applyFacetMappings(product, product.supplier_id, mappingIndex) : product
      return { ...mapped, search_text: catalogSearchText(mapped) }
    })
    return safeProducts
  })
}
