import styles from "../../../../portal-shell.module.css"

export default function ProductLoading() {
  return <main className={styles.productMain} aria-busy="true" aria-label="Loading product">
    <p role="status">Loading product options…</p>
    <div className={styles.loadingProduct} aria-hidden="true"><div className={styles.loadingVisual} /><div><div className={styles.loadingLine} /><div className={styles.loadingLine} /><div className={styles.loadingLine} /></div></div>
  </main>
}
