"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import styles from "../../portal-shell.module.css"

export default function ProductImage({ src, name, fallbackSrc, priority = false, sizes = "(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 25vw" }: { src?: string; name: string; fallbackSrc?: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  useEffect(() => setFallbackFailed(false), [fallbackSrc])
  const usingFallback = !src || failed
  const displayed = usingFallback ? fallbackSrc : src
  if (!displayed || fallbackFailed) return <div className={styles.productVisual} aria-hidden="true">M</div>
  return <Image key={displayed} className={styles.productImage} src={displayed} alt={usingFallback ? `${name} product photo; print guide unavailable` : name} width={640} height={640} sizes={sizes} priority={priority} unoptimized={!displayed.startsWith("/portal/media/")} onError={() => usingFallback ? setFallbackFailed(true) : setFailed(true)} />
}
