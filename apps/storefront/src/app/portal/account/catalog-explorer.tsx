"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import CatalogCard, { type CatalogProduct } from "./catalog-card"
import CatalogFilters, { type Facets } from "./catalog-filters"
import SearchSuggestions from "./discovery/search-suggestions"
import { catalogFilterKeys, catalogQuery, selectedCatalogFilters } from "./catalog-query"
import { filterLabel } from "./filter-label"
import { getFeaturedCollections } from "./discovery/actions"
import FeaturedCarousel from "./discovery/featured-carousel"
import type { FeaturedCollection } from "./discovery/types"
import styles from "../../portal-shell.module.css"

export type CatalogResponse = { products: CatalogProduct[]; total: number; page: number; page_size: number; page_count: number }

export default function CatalogExplorer({ initialCatalog, initialQuery, backend, featured }: { initialCatalog: CatalogResponse; initialQuery: string; backend: string; featured?: React.ReactNode }) {
  const [query, setQuery] = useState(initialQuery)
  const [catalog, setCatalog] = useState(initialCatalog)
  const [facets, setFacets] = useState<Facets>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [collections, setCollections] = useState<FeaturedCollection[]>()
  const request = useRef<AbortController | null>(null)
  const version = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const currentQuery = useRef(initialQuery)
  const mounted = useRef(false)
  const responseQuery = useRef(initialQuery)

  const read = async (next: string, view: "products" | "facets", signal: AbortSignal) => {
    const response = await fetch(`/portal/catalog?${next}&view=${view}`, { signal, cache: "no-store", credentials: "same-origin" })
    if (response.status === 401 || response.status === 403) {
      window.location.assign(`/portal/login?returnTo=${encodeURIComponent(`/portal/account?${next}`)}`)
      throw new Error("Sign in to view the catalog")
    }
    if (!response.ok) throw new Error("Could not update the catalog. Please retry.")
    return response.json()
  }

  const load = (next: string, products = true) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const id = ++version.current
    setError("")
    setPending(products)
    const productRequest = products ? read(next, "products", controller.signal).then((result: CatalogResponse) => {
      if (id !== version.current) return
      responseQuery.current = next
      setCatalog(result)
    }).finally(() => { if (id === version.current) setPending(false) }) : Promise.resolve()
    // Counts are independent: their response never holds back product cards.
    const facetQuery = new URLSearchParams(next)
    facetQuery.delete("page")
    facetQuery.delete("sort")
    const facetRequest = read(facetQuery.toString(), "facets", controller.signal).then((result: { facets: Facets }) => {
      if (id !== version.current) return
      setFacets(result.facets)
    })
    void Promise.allSettled([productRequest, facetRequest]).then((results) => {
      if (id !== version.current || controller.signal.aborted) return
      const failed = results.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "Could not update the catalog")
    })
  }

  const navigate = (params: URLSearchParams, batch = false) => {
    const next = catalogQuery(params).toString()
    if (next === currentQuery.current && !error) return
    currentQuery.current = next
    setQuery(next)
    setPending(true)
    request.current?.abort()
    // Invalidate in-flight responses immediately, including during batching.
    version.current++
    if (debounce.current) clearTimeout(debounce.current)
    window.history.replaceState(null, "", `/portal/account${next ? `?${next}` : ""}`)
    if (batch) debounce.current = setTimeout(() => load(next), 120)
    else load(next)
  }

  useEffect(() => {
    mounted.current = true
    load(currentQuery.current, false)
    const back = () => {
      if (debounce.current) clearTimeout(debounce.current)
      const next = catalogQuery(new URLSearchParams(window.location.search)).toString()
      currentQuery.current = next
      setQuery(next)
      load(next)
    }
    window.addEventListener("popstate", back)
    return () => {
      mounted.current = false
      version.current++
      if (debounce.current) clearTimeout(debounce.current)
      request.current?.abort()
      window.removeEventListener("popstate", back)
    }
  }, [])

  // A normal Next navigation (e.g. a category suggestion) supplies a fresh
  // server result; don't leave the previous client-side filters mounted.
  useEffect(() => {
    if (!mounted.current || initialQuery === currentQuery.current) return
    currentQuery.current = initialQuery
    responseQuery.current = initialQuery
    if (debounce.current) clearTimeout(debounce.current)
    setQuery(initialQuery)
    setCatalog(initialCatalog)
    load(initialQuery, false)
  }, [initialCatalog, initialQuery])

  const params = new URLSearchParams(query)
  const selected = selectedCatalogFilters(params)
  const active = catalogFilterKeys.flatMap((key) => selected[key]).filter(Boolean)
  const showFeatured = !params.get("q")?.trim() && !active.length && Number(params.get("page") || 1) === 1 && catalog.page === 1
  useEffect(() => {
    if (!showFeatured || featured || collections) return
    let cancelled = false
    void getFeaturedCollections().then((result) => { if (!cancelled) setCollections(result.collections) }).catch(() => {})
    return () => { cancelled = true }
  }, [showFeatured, featured, collections])
  const clear = new URLSearchParams()
  params.getAll("q").forEach((value) => clear.append("q", value))
  params.getAll("sort").forEach((value) => clear.append("sort", value))
  const clearHref = `/portal/account?${clear}`
  const without = (key: string, value: string) => {
    const next = new URLSearchParams(query)
    next.delete("page")
    const kept = next.getAll(key).filter((item) => item !== value)
    next.delete(key)
    kept.forEach((item) => next.append(key, item))
    return `/portal/account?${next}`
  }
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query)
    next.set("page", String(page))
    return `/portal/account?${next}`
  }
  // Remount cards only for a completed result, never for speculative filter
  // state. This preserves each colour's matching image, SKU, stock and price.
  const selectionKey = responseQuery.current
  return <div onClickCapture={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as HTMLElement).closest("a")
    if (!link || link.target || link.hasAttribute("download")) return
    if (link.getAttribute("aria-disabled") === "true") { event.preventDefault(); return }
    const url = new URL(link.href)
    if (url.origin !== window.location.origin || url.pathname !== "/portal/account") return
    event.preventDefault()
    navigate(url.searchParams)
  }}>
    {showFeatured && (featured || collections?.map((collection, index) => <FeaturedCarousel key={`${index}:${collection.label}`} collection={collection} backend={backend} />))}
    <form className={styles.catalogToolbar} action="/portal/account" onSubmit={(event) => {
      event.preventDefault()
      const next = new URLSearchParams()
      new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") next.append(key, value) })
      navigate(next)
    }}>
      <SearchSuggestions key={params.get("q") || ""} initialValue={params.get("q") || ""} onCategory={(url) => navigate(new URL(url, window.location.origin).searchParams)} />
      {catalogFilterKeys.flatMap((key) => selected[key].map((value) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />))}
      <select key={params.get("sort") || ""} name="sort" defaultValue={params.get("sort") || ""} aria-label="Sort products"><option value="">Recommended</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select>
      <button className={styles.primary} type="submit">Search</button>
    </form>
    {active.length > 0 && <div className={styles.activeFilters}>{catalogFilterKeys.flatMap((key) => selected[key].map((value) => <Link key={`${key}-${value}`} prefetch={false} aria-label={`Remove ${filterLabel(key, value)}`} href={without(key, value)}>{filterLabel(key, value)} ×</Link>))}<Link prefetch={false} href={clearHref}>Clear all</Link></div>}
    {error && <p className={styles.helper} role="alert">{error} <button type="button" onClick={() => load(currentQuery.current, responseQuery.current !== currentQuery.current)}>Retry</button></p>}
    <div className={styles.catalogLayout}>
      {facets ? <CatalogFilters facets={facets} selected={selected} activeCount={active.length} clearHref={clearHref} onNavigate={(next) => navigate(next, true)} updating={pending} /> : <aside className={styles.filterColumn} aria-busy="true"><button className={styles.mobileFilterButton} disabled>Filters</button><div className={styles.catalogFilters}><div className={styles.filterHeading}><strong>Filters</strong></div><span className={styles.filterUpdating} role="status">Loading filters…</span></div></aside>}
      <section className={styles.catalogResults} aria-busy={pending}>
        <div className={styles.resultsHeading}><strong>{catalog.total.toLocaleString()} products</strong><span>{pending ? "Updating results…" : `Page ${catalog.page} of ${catalog.page_count}`}</span></div>
        {catalog.products.length ? <div className={styles.catalogGrid}>{catalog.products.map((product, index) => <CatalogCard key={`${product.id}:${selectionKey}`} product={product} backend={backend} priority={index < 2} />)}</div> : <div className={styles.empty}><h2>No products match these filters</h2><p>Clear some filters and try again.</p></div>}
        {catalog.page_count > 1 && <nav className={styles.pagination} aria-label="Catalogue pages"><Link prefetch={false} className={catalog.page <= 1 ? styles.disabledPage : styles.secondary} aria-disabled={catalog.page <= 1} href={pageHref(Math.max(1, catalog.page - 1))}>Previous</Link><span>Page {catalog.page} of {catalog.page_count}</span><Link prefetch={false} className={catalog.page >= catalog.page_count ? styles.disabledPage : styles.secondary} aria-disabled={catalog.page >= catalog.page_count} href={pageHref(Math.min(catalog.page_count, catalog.page + 1))}>Next</Link></nav>}
      </section>
    </div>
  </div>
}
