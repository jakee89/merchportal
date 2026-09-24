"use client"

import { useMemo, useRef } from "react"
import ProductImage from "../../product-image"
import styles from "../../../../portal-shell.module.css"

type Method = {
  id: string
  name: string
  positions: Array<{ id: string; name: string; max_width_mm?: number; max_height_mm?: number; image_url?: string; images?: Array<{ url: string }> }>
}

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  if (value.startsWith("/media/")) return `/portal${value}`
  return value.startsWith("https://") ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default function PrintingOptions({ methods, backend }: { methods: Method[]; backend: string }) {
  const track = useRef<HTMLDivElement>(null)
  const options = useMemo(() => {
    const seen = new Set<string>()
    return methods.flatMap((method) => method.positions.flatMap((position) => {
      const key = `${method.name.trim().toLocaleLowerCase()}:${position.id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ key, name: method.name, position }]
    }))
  }, [methods])

  return <div className={styles.printCarouselWrap}>
    <button className={styles.carouselArrow} type="button" aria-label="Previous printing options" onClick={() => track.current?.scrollBy({ left: -320, behavior: "smooth" })}>‹</button>
    <div ref={track} className={styles.printCarousel} role="list" aria-label="Printing techniques and positions">
      {options.map(({ key, name, position }) => <article role="listitem" key={key} className={styles.printCarouselCard}>
        <ProductImage src={mediaUrl(backend, position.images?.[0]?.url || position.image_url)} name={`${name} on ${position.name}`} />
        <strong>{name}</strong><span>{position.name}</span>
        {position.max_width_mm && position.max_height_mm && <small>{position.max_width_mm} × {position.max_height_mm} mm</small>}
      </article>)}
    </div>
    <button className={styles.carouselArrow} type="button" aria-label="Next printing options" onClick={() => track.current?.scrollBy({ left: 320, behavior: "smooth" })}>›</button>
  </div>
}
