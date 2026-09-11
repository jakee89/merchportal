"use client"

import { useState } from "react"
import styles from "../../portal-shell.module.css"

export default function ProductImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div className={styles.productVisual} aria-hidden="true">M</div>
  return <img className={styles.productImage} src={src} alt={name} onError={() => setFailed(true)} />
}
