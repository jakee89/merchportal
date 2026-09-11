import type { Metadata } from "next"
import Link from "next/link"
import styles from "../portal-shell.module.css"

export const metadata: Metadata = { title: "Admin Overview" }

const metrics = [
  ["1,248", "Active products"],
  ["2", "Supplier connections"],
  ["12", "Client accounts"],
  ["7", "Quote requests"],
]

export default function AdminPreviewPage() {
  return (
    <div className={`${styles.page} ${styles.adminLayout}`}>
      <aside className={styles.sidebar}>
        <Link href="/admin" className={`${styles.brand} ${styles.focusable}`}>
          <span className={styles.mark}>M</span>
          MerchPortal
        </Link>
        <nav className={styles.sideNav} aria-label="Administration navigation">
          <Link href="/admin">Dashboard</Link>
          <Link href="#catalog">Catalog</Link>
          <Link href="#suppliers">Suppliers</Link>
          <Link href="#clients">Clients</Link>
          <Link href="#quotes">Quote requests</Link>
          <Link href="#mapping">AI mapping</Link>
          <Link href="#settings">Settings</Link>
        </nav>
      </aside>
      <main className={styles.adminMain}>
        <header className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Friday, 11 September</span>
            <h1>Good morning</h1>
            <p>Here is what needs attention across the merchandise platform.</p>
          </div>
          <Link
            href="/portal"
            className={`${styles.primary} ${styles.focusable}`}
          >
            View client portal
          </Link>
        </header>
        <section className={styles.metricGrid} aria-label="Platform summary">
          {metrics.map(([value, label]) => (
            <article className={styles.metric} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <span>Foundation preview</span>
            </article>
          ))}
        </section>
        <div className={styles.adminGrid}>
          <section className={styles.panel} aria-labelledby="attention-heading">
            <h2 id="attention-heading">Needs your attention</h2>
            <ul className={styles.attention}>
              <li>
                <span>Supplier connections need credentials</span>
                <b>2</b>
              </li>
              <li>
                <span>Category mappings waiting for review</span>
                <b>24</b>
              </li>
              <li>
                <span>Quote requests awaiting response</span>
                <b>7</b>
              </li>
              <li>
                <span>Products missing optimized images</span>
                <b>18</b>
              </li>
            </ul>
          </section>
          <section className={styles.panel} aria-labelledby="actions-heading">
            <h2 id="actions-heading">Quick actions</h2>
            <div className={styles.actionGrid}>
              <Link href="#clients">Add client</Link>
              <Link href="#suppliers">Add supplier</Link>
              <Link href="#catalog">Search product</Link>
              <Link href="/portal">View as client</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
