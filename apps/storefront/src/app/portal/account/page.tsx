import Link from "next/link"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import { redirect } from "next/navigation"
import styles from "../../portal-shell.module.css"
import ProductImage from "./product-image"

type PortalMe = {
  membership: { role: string } | null
  organization: {
    name: string
    logo_url?: string
    primary_color: string
  } | null
}
type Product = {
  id: string
  sku?: string
  name: string
  description?: string
  image_url?: string
  price_eur?: number
  stock_quantity?: number
  category?: string
  colors: string[]
  lead_time?: string
  sustainable: boolean
  print_methods: string[]
}
type Facets = {
  categories: string[]
  colors: string[]
  lead_times: string[]
  print_methods: string[]
}
type Search = Record<string, string | string[] | undefined>

function productImageUrl(backend: string, value?: string) {
  if (!value) return
  return /^https?:\/\//i.test(value) ? value : `${backend}${value}`
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const customer = await retrieveCustomer()
  if (!customer) redirect("/portal/login")
  const headers = await getAuthHeaders()
  const me = await sdk.client.fetch<PortalMe>("/portal-api/me", {
    headers,
    cache: "no-store",
  })
  if (!me.organization) redirect("/portal/login")
  const selected = await searchParams
  const chosen = (key: string) => (typeof selected[key] === "string" ? (selected[key] as string) : "")
  const query = new URLSearchParams()
  for (const key of ["q", "category", "color", "min_price", "max_price", "lead_time", "print_method", "in_stock", "sustainable"]) {
    const found = selected[key]
    if (typeof found === "string" && found) query.set(key, found)
  }
  const hasFilters = Boolean(query.toString())
  const catalog = await sdk.client.fetch<{
    products: Product[]
    facets: Facets
    total: number
  }>(`/portal-api/catalog?${query}`, { headers, cache: "no-store" })
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return (
    <div
      className={styles.page}
      style={
        {
          "--client-color": me.organization.primary_color,
        } as React.CSSProperties
      }
    >
      <header className={styles.topbar}>
        <Link href="/portal" className={styles.brand}>
          <span className={styles.mark}>M</span>
          {me.organization.name}
        </Link>
        <span>
          {customer.first_name || customer.email} · {me.membership?.role.replace("client_", "")}
        </span>
      </header>
      <main className={styles.main}>
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.eyebrow}>Private client catalog</span>
            <h1>{me.organization.name}</h1>
          </div>
        </div>
        <form className={styles.filters} method="get">
          <label className={styles.searchField}>
            Search
            <input name="q" defaultValue={chosen("q")} placeholder="Product name or code" />
          </label>
          <label>
            Category
            <select name="category" defaultValue={chosen("category")}>
              <option value="">All categories</option>
              {catalog.facets.categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Colour
            <select name="color" defaultValue={chosen("color")}>
              <option value="">All colours</option>
              {catalog.facets.colors.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum price
            <input type="number" min="0" step="0.01" name="min_price" defaultValue={chosen("min_price")} />
          </label>
          <label>
            Maximum price
            <input type="number" min="0" step="0.01" name="max_price" defaultValue={chosen("max_price")} />
          </label>
          <label>
            Lead time
            <select name="lead_time" defaultValue={chosen("lead_time")}>
              <option value="">Any lead time</option>
              {catalog.facets.lead_times.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Print method
            <select name="print_method" defaultValue={chosen("print_method")}>
              <option value="">Any print method</option>
              {catalog.facets.print_methods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="in_stock" value="true" defaultChecked={selected.in_stock === "true"} />
            In stock
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="sustainable" value="true" defaultChecked={selected.sustainable === "true"} />
            Sustainable
          </label>
          <button className={styles.primary} type="submit">
            Apply filters
          </button>
          <Link className={styles.secondary} href="/portal/account">
            Clear
          </Link>
        </form>
        <p className={styles.resultCount}>{catalog.total} products found</p>
        {catalog.products.length ? (
          <div className={styles.grid}>
            {catalog.products.map((product) => (
              <article className={styles.card} key={product.id}>
                <ProductImage src={productImageUrl(backend, product.image_url)} name={product.name} />
                <div className={styles.badges}>
                  {product.category && <span>{product.category}</span>}
                  {product.sustainable && <span>Sustainable</span>}
                </div>
                <h3>{product.name}</h3>
                <p className={styles.muted}>{product.description}</p>
                {product.price_eur !== undefined && <p className={styles.price}>From EUR {product.price_eur.toFixed(2)}</p>}
                <p className={styles.status}>
                  {product.stock_quantity !== undefined ? `${product.stock_quantity} available` : "Availability on request"}
                  {product.sku ? ` · Code ${product.sku}` : ""}
                </p>
                {product.lead_time && <p className={styles.detail}>Lead time: {product.lead_time}</p>}
                {product.print_methods.length > 0 && <p className={styles.detail}>Print: {product.print_methods.join(", ")}</p>}
                <Link className={styles.configureLink} href={`/portal/account/products/${product.id}`}>
                  Configure product
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h2>{hasFilters ? "No products match these filters" : "No approved products yet"}</h2>
            <p>{hasFilters ? "Clear some filters and try again." : "A staff member must approve products in MerchPortal before clients can see them."}</p>
          </div>
        )}
      </main>
    </div>
  )
}
