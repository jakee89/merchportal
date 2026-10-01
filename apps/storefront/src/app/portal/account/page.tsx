import Link from "next/link"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import styles from "../../portal-shell.module.css"
import CatalogExplorer, { type CatalogResponse } from "./catalog-explorer"
import QuoteCartLink from "./quote-cart-link"
import FeaturedCarousel from "./discovery/featured-carousel"
import { getFeaturedCollections } from "./discovery/actions"
import discoveryStyles from "./discovery/discovery.module.css"

type PortalMe = { membership: { role: string } | null; organization: { name: string; primary_color: string } | null }
type Search = Record<string, string | string[] | undefined>
const filterKeys = ["category", "color", "size", "material", "brand", "lead_time", "print_method", "min_price", "max_price", "in_stock", "out_of_stock", "sustainable"]

async function FeaturedProducts({ backend }: { backend: string }) {
  try {
    const { collections } = await getFeaturedCollections()
    return <>{collections.map((collection, index) => <FeaturedCarousel key={`${index}:${collection.label}`} collection={collection} backend={backend} />)}</>
  } catch { return null }
}

function values(input: string | string[] | undefined) {
  return (Array.isArray(input) ? input : input ? [input] : []).filter(Boolean)
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [headers, search] = await Promise.all([getAuthHeaders(), searchParams])
  if (!headers.authorization) redirect("/portal/login")
  const query = new URLSearchParams()
  for (const key of [...filterKeys, "q", "sort", "page"]) values(search[key]).forEach((value) => query.append(key, value))
  const [me, catalog, customerResult] = await Promise.all([
    sdk.client.fetch<PortalMe>("/portal-api/me", { headers, cache: "no-store" }),
    sdk.client.fetch<CatalogResponse>(`/portal-api/catalog?${query}&view=products&compact=true`, { headers, cache: "no-store" }),
    sdk.client.fetch<{ customer: { first_name?: string; email: string } }>("/store/customers/me?fields=id,first_name,email", { headers, cache: "no-store" }).catch(() => null),
  ])
  if (!me.organization || !customerResult) redirect("/portal/login")
  const customer = customerResult.customer
  const selected = Object.fromEntries([...filterKeys, "q", "sort"].map((key) => [key, values(search[key])]))
  const active = filterKeys.flatMap((key) => selected[key]).filter(Boolean)
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return <div className={styles.page} style={{ "--client-color": me.organization.primary_color } as React.CSSProperties}>
    <header className={styles.topbar}><Link href="/portal" className={styles.brand}><span className={styles.mark}>M</span>{me.organization.name}</Link><span className={styles.headerActions}>{customer.first_name || customer.email} · {me.membership?.role.replace("client_", "")} · <Link href="/portal/account/profile">Profile</Link> · <Suspense fallback={<Link href="/portal/account/quotes">Quote cart</Link>}><QuoteCartLink /></Suspense></span></header>
    <main className={styles.catalogMain}>
      <header className={styles.catalogIntro}><span className={styles.eyebrow}>Private client catalogue</span><h1>Promotional products</h1><p>Explore products, live availability and custom branding options.</p></header>
      <nav className={discoveryStyles.toolbar} aria-label="Product tools"><Link href="/portal/account/shortlists">Your shortlists →</Link><Link href="/portal/account/compare">Compare products →</Link></nav>
      <CatalogExplorer initialCatalog={catalog} initialQuery={query.toString()} backend={backend} featured={!values(search.q)[0]?.trim() && !active.length && catalog.page === 1 ? <Suspense fallback={null}><FeaturedProducts backend={backend} /></Suspense> : undefined} />
    </main>
  </div>
}
