import styles from "../../portal-shell.module.css"

export default function CatalogLoading() {
  return <main className={styles.catalogMain} aria-busy="true" aria-label="Loading catalogue">
    <header className={styles.catalogIntro}><span className={styles.eyebrow}>Private client catalogue</span><h1>Promotional products</h1><p role="status">Loading products and filters…</p></header>
    <div className={styles.catalogGrid} aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div key={index} className={styles.catalogCard}><div className={styles.loadingVisual} /><div className={styles.cardBody}><div className={styles.loadingLine} /><div className={styles.loadingLine} /></div></div>)}</div>
  </main>
}
