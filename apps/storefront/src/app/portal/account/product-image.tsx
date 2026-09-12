"use client"

import { useEffect, useState } from "react"
import styles from "../../portal-shell.module.css"

export default function ProductImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <div className={styles.productVisual} aria-hidden="true">M</div>
  return <img className={styles.productImage} src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}
