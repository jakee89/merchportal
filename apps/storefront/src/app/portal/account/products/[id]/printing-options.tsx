"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ProductImage from "../../product-image"
import styles from "../../../../portal-shell.module.css"

type Method = {
  id: string
  name: string
  positions: Array<{ id: string; name: string; max_width_mm?: number; max_height_mm?: number; image_url?: string; images?: Array<{ variant_color?: string; url: string }> }>
}
type Variant = { sku?: string; color: string; color_code?: string; images: string[] }

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  if (value.startsWith("/media/")) return `/portal${value}`
  return value.startsWith("https://") ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default function PrintingOptions({ methods, backend, variants, initialSku }: { methods: Method[]; backend: string; variants: Variant[]; initialSku?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [variant, setVariant] = useState<Variant | undefined>(variants.find((item) => item.sku === initialSku) || variants[0])
  useEffect(() => {
    const update = (event: Event) => setVariant((event as CustomEvent<Variant>).detail)
    window.addEventListener("merchportal:variant-colour", update)
    return () => window.removeEventListener("merchportal:variant-colour", update)
  }, [])
  const options = useMemo(() => {
    const seen = new Set<string>()
    return methods.flatMap((method) => method.positions.flatMap((position) => {
      const key = `${method.name.trim().toLocaleLowerCase()}:${position.id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ key, name: method.name, position }]
    }))
  }, [methods])
  const colourKeys = [variant?.color, variant?.color_code, variant?.sku?.split("-").at(-1)].filter(Boolean).map((value) => value!.trim().toLowerCase())
  const guideFor = (position: Method["positions"][number]) => position.images?.find((image) => image.variant_color && colourKeys.includes(image.variant_color.trim().toLowerCase()))?.url || position.images?.find((image) => !image.variant_color)?.url || (!position.images?.length ? position.image_url : undefined)

  return <div className={styles.printCarouselWrap}>
    <button className={styles.carouselArrow} type="button" aria-label="Previous printing options" onClick={() => track.current?.scrollBy({ left: -320, behavior: "smooth" })}>‹</button>
    <div ref={track} className={styles.printCarousel} role="list" aria-label="Printing techniques and positions">
      {options.map(({ key, name, position }) => <article role="listitem" key={key} className={styles.printCarouselCard}>
        <ProductImage src={mediaUrl(backend, guideFor(position))} fallbackSrc={mediaUrl(backend, variant?.images?.[0])} name={`${name} on ${position.name}`} />
        <strong>{name}</strong><span>{position.name}</span>
        {position.max_width_mm && position.max_height_mm && <small>{position.max_width_mm} × {position.max_height_mm} mm</small>}
      </article>)}
    </div>
    <button className={styles.carouselArrow} type="button" aria-label="Next printing options" onClick={() => track.current?.scrollBy({ left: 320, behavior: "smooth" })}>›</button>
  </div>
}
