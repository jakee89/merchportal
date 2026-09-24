import Link from "next/link"
import { redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import styles from "../../portal-shell.module.css"
import CatalogCard, { type CatalogProduct } from "./catalog-card"
import CatalogFilters from "./catalog-filters"

type PortalMe = { membership: { role: string } | null; organization: { name: string; primary_color: string } | null }
type Facet = { value: string; count: number }
type Facets = { categories: Facet[]; colors: Facet[]; materials: Facet[]; brands: Facet[]; lead_times: Facet[]; print_methods: Facet[]; availability: { in_stock: number; sustainable: number } }
type Search = Record<string, string | string[] | undefined>
type CatalogResponse = { products: CatalogProduct[]; facets: Facets; total: number; page: number; page_size: number; page_count: number }
const filterKeys = ["category", "color", "material", "brand", "lead_time", "print_method", "min_price", "max_price", "in_stock", "sustainable"]

function values(input: string | string[] | undefined) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean)
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const customer = await retrieveCustomer()
  if (!customer) redirect("/portal/login")
  const headers = await getAuthHeaders()
  const me = await sdk.client.fetch<PortalMe>("/portal-api/me", { headers, cache: "no-store" })
  if (!me.organization) redirect("/portal/login")
  const search = await searchParams
  const query = new URLSearchParams()
  for (const key of [...filterKeys, "q", "sort", "page"]) values(search[key]).forEach((value) => query.append(key, value))
  const catalog = await sdk.client.fetch<CatalogResponse>(`/portal-api/catalog?${query}`, { headers, cache: "no-store" })
  const selected = Object.fromEntries([...filterKeys, "q", "sort"].map((key) => [key, values(search[key])]))
  const active = filterKeys.flatMap((key) => selected[key]).filter(Boolean)
  const hrefWithout = (key: string, value: string) => {
    const next = new URLSearchParams(query)
    next.delete("page")
    const kept = next.getAll(key).filter((item) => item !== value)
    next.delete(key)
    kept.forEach((item) => next.append(key, item))
    return `/portal/account?${next}`
  }
  const pageHref = (page: number) => { const next = new URLSearchParams(query); next.set("page", String(page)); return `/portal/account?${next}` }
  const clearQuery = new URLSearchParams()
  values(search.q).forEach((value) => clearQuery.append("q", value))
  values(search.sort).forEach((value) => clearQuery.append("sort", value))
  const clearHref = `/portal/account?${clearQuery}`
  const optionSelectionKey = ["color", "min_price", "max_price", "in_stock"].flatMap((key) => selected[key]).join("|")
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return <div className={styles.page} style={{ "--client-color": me.organization.primary_color } as React.CSSProperties}>
    <header className={styles.topbar}><Link href="/portal" className={styles.brand}><span className={styles.mark}>M</span>{me.organization.name}</Link><span>{customer.first_name || customer.email} · {me.membership?.role.replace("client_", "")} · <Link href="/portal/account/quotes">Quote cart</Link></span></header>
    <main className={styles.catalogMain}>
      <header className={styles.catalogIntro}><span className={styles.eyebrow}>Private client catalogue</span><h1>Promotional products</h1><p>Explore products, live availability and custom branding options.</p></header>
      <form className={styles.catalogToolbar} method="get">
        <input name="q" defaultValue={values(search.q)[0]} placeholder="Search products or codes" aria-label="Search catalogue" />
        {filterKeys.flatMap((key) => selected[key].map((value) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />))}
        <select name="sort" defaultValue={values(search.sort)[0]} aria-label="Sort products"><option value="">Recommended</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select>
        <button className={styles.primary} type="submit">Search</button>
      </form>
      {active.length > 0 && <div className={styles.activeFilters}>{filterKeys.flatMap((key) => selected[key].map((value) => <Link key={`${key}-${value}`} href={hrefWithout(key, value)}>{value} ×</Link>))}<Link href={clearHref}>Clear all</Link></div>}
      <div className={styles.catalogLayout}>
        <CatalogFilters facets={catalog.facets} selected={selected} activeCount={active.length} clearHref={clearHref} />
        <section className={styles.catalogResults}>
          <div className={styles.resultsHeading}><strong>{catalog.total.toLocaleString()} products</strong><span>Page {catalog.page} of {catalog.page_count}</span></div>
          {catalog.products.length ? <div className={styles.catalogGrid}>{catalog.products.map((product) => <CatalogCard key={`${product.id}:${optionSelectionKey}`} product={product} backend={backend} />)}</div> : <div className={styles.empty}><h2>No products match these filters</h2><p>Clear some filters and try again.</p></div>}
          {catalog.page_count > 1 && <nav className={styles.pagination} aria-label="Catalogue pages"><Link className={catalog.page <= 1 ? styles.disabledPage : styles.secondary} href={pageHref(Math.max(1, catalog.page - 1))}>Previous</Link><span>Page {catalog.page} of {catalog.page_count}</span><Link className={catalog.page >= catalog.page_count ? styles.disabledPage : styles.secondary} href={pageHref(Math.min(catalog.page_count, catalog.page + 1))}>Next</Link></nav>}
        </section>
      </div>
    </main>
  </div>
}
