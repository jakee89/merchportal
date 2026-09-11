import type { Metadata } from "next"
import Link from "next/link"
import styles from "../portal-shell.module.css"

export const metadata: Metadata = { title: "Client Portal" }

const products = [
  ["B", "Eco Steel Bottle 500ml", "from EUR 4.20", "In stock"],
  ["T", "Recycled Canvas Tote", "from EUR 2.10", "In stock"],
  ["P", "Aluminium Soft-Touch Pen", "from EUR 0.86", "In stock"],
  ["N", "A5 Recycled Notebook", "from EUR 2.95", "Low stock"],
]

export default function PortalPage() {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/portal" className={`${styles.brand} ${styles.focusable}`}>
          <span className={styles.mark}>M</span>
          MerchPortal
        </Link>
        <nav className={styles.nav} aria-label="Client navigation">
          <Link href="#products">Products</Link>
          <Link href="#ideas">Ideas</Link>
          <Link href="#collections">Collections</Link>
          <Link href="#favourites">Favourites</Link>
        </nav>
        <Link
          href="/portal/login"
          className={`${styles.secondary} ${styles.focusable}`}
        >
          Client sign in
        </Link>
      </header>
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="portal-heading">
          <div>
            <span className={styles.eyebrow}>Merchandise made simple</span>
            <h1 id="portal-heading">What are you looking for?</h1>
            <p>
              Find practical product ideas by event, budget, colour, lead time,
              or print method, then collect them in one clear quote request.
            </p>
            <form className={styles.search} role="search">
              <label className="sr-only" htmlFor="product-search">
                Search products and ideas
              </label>
              <input
                id="product-search"
                name="query"
                placeholder="Search products, ideas, budgets, events..."
                type="search"
              />
              <button
                className={`${styles.primary} ${styles.focusable}`}
                type="submit"
              >
                Search products
              </button>
            </form>
          </div>
          <aside className={styles.spotlight} id="ideas">
            <span className={styles.eyebrow}>Planning a campaign?</span>
            <strong>Start with the occasion, budget, and delivery date.</strong>
            <span>We will help narrow the catalog.</span>
          </aside>
        </section>
        <section id="products" aria-labelledby="popular-products">
          <div className={styles.sectionTitle}>
            <h2 id="popular-products">Popular right now</h2>
            <Link href="#products" className={styles.secondary}>
              Browse all
            </Link>
          </div>
          <div className={styles.grid}>
            {products.map(([letter, name, price, stock]) => (
              <article className={styles.card} key={name}>
                <div className={styles.productVisual} aria-hidden="true">
                  {letter}
                </div>
                <h3>{name}</h3>
                <p className={styles.muted}>
                  Multiple colours and print options
                </p>
                <p className={styles.price}>{price}</p>
                <p className={styles.status}>{stock}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
