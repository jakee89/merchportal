type CatalogCacheEntry = { expires: number; products: any[] }
type CatalogResponseCacheEntry = { expires: number; response: Record<string, unknown> }

export const portalCatalogCache = new Map<string, CatalogCacheEntry>()
export const portalCatalogResponseCache = new Map<string, CatalogResponseCacheEntry>()

export function removeExpiredPortalCatalogCacheEntries() {
  const now = Date.now()
  for (const [key, value] of portalCatalogCache) {
    if (value.expires <= now) portalCatalogCache.delete(key)
  }
  for (const [key, value] of portalCatalogResponseCache) {
    if (value.expires <= now) portalCatalogResponseCache.delete(key)
  }
}

export function cachePortalCatalogResponse(key: string, response: Record<string, unknown>) {
  if (portalCatalogResponseCache.size >= 100) portalCatalogResponseCache.delete(portalCatalogResponseCache.keys().next().value!)
  portalCatalogResponseCache.set(key, { expires: Date.now() + 30_000, response })
}

export function clearPortalCatalogCache() {
  portalCatalogCache.clear()
  portalCatalogResponseCache.clear()
}
