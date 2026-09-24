"use client"

import { useEffect, useState } from "react"
import styles from "../../portal-shell.module.css"

export default function ProductImage({ src, name, fallbackSrc }: { src?: string; name: string; fallbackSrc?: string }) {
  const [failed, setFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  useEffect(() => setFallbackFailed(false), [fallbackSrc])
  const usingFallback = !src || failed
  const displayed = usingFallback ? fallbackSrc : src
  if (!displayed || fallbackFailed) return <div className={styles.productVisual} aria-hidden="true">M</div>
  return <img className={styles.productImage} src={displayed} alt={usingFallback ? `${name} product photo; print guide unavailable` : name} loading="lazy" decoding="async" onError={() => usingFallback ? setFallbackFailed(true) : setFailed(true)} />
}
