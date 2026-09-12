type CatalogCacheEntry = { expires: number; products: any[]; facets: any }

export const portalCatalogCache = new Map<string, CatalogCacheEntry>()

export function removeExpiredPortalCatalogCacheEntries() {
  const now = Date.now()
  for (const [key, value] of portalCatalogCache) {
    if (value.expires <= now) portalCatalogCache.delete(key)
  }
}

export function clearPortalCatalogCache() {
  portalCatalogCache.clear()
}
