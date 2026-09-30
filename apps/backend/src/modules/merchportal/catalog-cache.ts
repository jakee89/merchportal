import { portalPreparedCatalogCache, portalReadCache, portalSourceCache } from "./read-cache"

type CatalogCacheEntry = { expires: number; products: any[] }
type CatalogResponseCacheEntry = { expires: number; response: Record<string, unknown> }
type CatalogFacetCacheEntry = { expires: number; facets: Record<string, unknown> }

export const portalCatalogCache = new Map<string, CatalogCacheEntry>()
export const portalCatalogResponseCache = new Map<string, CatalogResponseCacheEntry>()
export const portalCatalogFacetCache = new Map<string, CatalogFacetCacheEntry>()

export function removeExpiredPortalCatalogCacheEntries() {
  const now = Date.now()
  for (const [key, value] of portalCatalogCache) {
    if (value.expires <= now) portalCatalogCache.delete(key)
  }
  for (const [key, value] of portalCatalogResponseCache) {
    if (value.expires <= now) portalCatalogResponseCache.delete(key)
  }
  for (const [key, value] of portalCatalogFacetCache) {
    if (value.expires <= now) portalCatalogFacetCache.delete(key)
  }
}

export function cachePortalCatalogResponse(key: string, response: Record<string, unknown>) {
  if (portalCatalogResponseCache.size >= 100) portalCatalogResponseCache.delete(portalCatalogResponseCache.keys().next().value!)
  portalCatalogResponseCache.set(key, { expires: Date.now() + 5 * 60_000, response })
}

export function cachePortalCatalogFacets(key: string, facets: Record<string, unknown>) {
  if (portalCatalogFacetCache.size >= 100) portalCatalogFacetCache.delete(portalCatalogFacetCache.keys().next().value!)
  portalCatalogFacetCache.set(key, { expires: Date.now() + 10 * 60_000, facets })
}

export function clearPortalCatalogCache() {
  portalReadCache.clear()
  portalPreparedCatalogCache.clear()
  portalSourceCache.clear()
  portalCatalogCache.clear()
  portalCatalogResponseCache.clear()
  portalCatalogFacetCache.clear()
}
