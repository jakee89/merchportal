import Link from "next/link"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import { redirect } from "next/navigation"
import styles from "../../portal-shell.module.css"
import ProductImage from "./product-image"

type PortalMe = { membership: { role: string } | null; organization: { name: string; logo_url?: string; primary_color: string } | null }
type Product = { id: string; sku?: string; name: string; description?: string; image_url?: string; price_eur?: number; stock_quantity?: number }

export default async function AccountPage() {
  const customer = await retrieveCustomer()
  if (!customer) redirect("/portal/login")
  const headers = await getAuthHeaders()
  const me = await sdk.client.fetch<PortalMe>("/portal-api/me", { headers, cache: "no-store" })
  if (!me.organization) redirect("/portal/login")
  const catalog = await sdk.client.fetch<{ products: Product[] }>("/portal-api/catalog", { headers, cache: "no-store" })
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  return <div className={styles.page} style={{ "--client-color": me.organization.primary_color } as React.CSSProperties}>
    <header className={styles.topbar}><Link href="/portal" className={styles.brand}><span className={styles.mark}>M</span>{me.organization.name}</Link><span>{customer.first_name || customer.email} · {me.membership?.role.replace("client_", "")}</span></header>
    <main className={styles.main}><div className={styles.sectionTitle}><div><span className={styles.eyebrow}>Private client catalog</span><h1>{me.organization.name}</h1></div></div>
      {catalog.products.length ? <div className={styles.grid}>{catalog.products.map((product) => <article className={styles.card} key={product.id}><ProductImage src={product.image_url ? `${backend}${product.image_url}` : undefined} name={product.name} /><h3>{product.name}</h3><p className={styles.muted}>{product.description}</p>{product.price_eur !== undefined && <p className={styles.price}>EUR {product.price_eur.toFixed(2)}</p>}<p className={styles.status}>{product.stock_quantity !== undefined ? `${product.stock_quantity} available` : "Availability on request"}{product.sku ? ` · Code ${product.sku}` : ""}</p></article>)}</div> : <div className={styles.empty}><h2>Catalog is ready for its first import</h2><p>Ask a staff member to open MerchPortal in Admin and run a catalog update.</p></div>}
    </main>
  </div>
}
