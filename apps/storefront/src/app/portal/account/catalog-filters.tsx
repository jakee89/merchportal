"use client"

import Link from "next/link"
import { useState } from "react"
import styles from "../../portal-shell.module.css"

type Facet = { value: string; count: number }
type Facets = { categories: Facet[]; colors: Facet[]; materials: Facet[]; brands: Facet[]; lead_times: Facet[]; print_methods: Facet[] }

export default function CatalogFilters({ facets, selected, activeCount }: { facets: Facets; selected: Record<string, string[]>; activeCount: number }) {
  const [open, setOpen] = useState(false)
  const group = (title: string, name: string, items: Facet[]) => items.length ? <fieldset className={styles.facetGroup}>
    <legend>{title}</legend>
    {items.slice(0, 18).map((item) => <label key={item.value}><input type="checkbox" name={name} value={item.value} defaultChecked={selected[name]?.includes(item.value)} /><span>{item.value}</span><small>{item.count}</small></label>)}
  </fieldset> : null
  return <aside className={styles.filterColumn}>
    <button className={styles.mobileFilterButton} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Filters{activeCount ? ` (${activeCount})` : ""}</button>
    <form className={`${styles.catalogFilters} ${open ? styles.filtersOpen : ""}`} method="get">
      {selected.q?.[0] && <input type="hidden" name="q" value={selected.q[0]} />}
      {selected.sort?.[0] && <input type="hidden" name="sort" value={selected.sort[0]} />}
      <div className={styles.filterHeading}><strong>Filters</strong><Link href="/portal/account">Clear all</Link></div>
      {group("Category", "category", facets.categories)}{group("Colour", "color", facets.colors)}{group("Material", "material", facets.materials)}{group("Brand", "brand", facets.brands)}{group("Print technology", "print_method", facets.print_methods)}
      <fieldset className={styles.facetGroup}><legend>Price</legend><div className={styles.priceInputs}><input aria-label="Minimum price" name="min_price" type="number" min="0" step="0.01" placeholder="Min €" defaultValue={selected.min_price?.[0]} /><input aria-label="Maximum price" name="max_price" type="number" min="0" step="0.01" placeholder="Max €" defaultValue={selected.max_price?.[0]} /></div></fieldset>
      <fieldset className={styles.facetGroup}><legend>Availability</legend><label><input type="checkbox" name="in_stock" value="true" defaultChecked={selected.in_stock?.includes("true")} /><span>In stock</span></label><label><input type="checkbox" name="sustainable" value="true" defaultChecked={selected.sustainable?.includes("true")} /><span>Sustainable</span></label></fieldset>
      <button className={styles.primary} type="submit">Apply filters</button>
    </form>
  </aside>
}
