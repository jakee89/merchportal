"use client"

import { useRef } from "react"
import CatalogCard from "../catalog-card"
import type { FeaturedCollection } from "./types"
import styles from "./discovery.module.css"

export default function FeaturedCarousel({
  collection,
  backend,
}: {
  collection: FeaturedCollection
  backend: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const scroll = (direction: number) =>
    track.current?.scrollBy({
      left: direction * (track.current?.clientWidth || 300),
    })
  return (
    <section className={styles.carousel} aria-label={collection.label}>
      <div className={styles.carouselHeading}>
        <h2>{collection.label}</h2>
        <div className={styles.carouselControls}>
          <button
            type="button"
            aria-label={`Previous ${collection.label} products`}
            onClick={() => scroll(-1)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label={`Next ${collection.label} products`}
            onClick={() => scroll(1)}
          >
            →
          </button>
        </div>
      </div>
      <div className={styles.carouselTrack} ref={track}>
        {collection.products.map((product) => (
          <div key={product.id} className={styles.carouselItem}>
            <CatalogCard product={product} backend={backend} />
          </div>
        ))}
      </div>
    </section>
  )
}
