"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import styles from "../../portal-shell.module.css"

type Facet = { value: string; count: number }
type Facets = { categories: Facet[]; colors: Facet[]; materials: Facet[]; brands: Facet[]; lead_times: Facet[]; print_methods: Facet[]; availability: { in_stock: number; sustainable: number } }

export default function CatalogFilters({ facets, selected, activeCount, clearHref }: { facets: Facets; selected: Record<string, string[]>; activeCount: number; clearHref: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [localSelected, setLocalSelected] = useState(selected)
  const [optionSearch, setOptionSearch] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const pendingQuery = useRef<URLSearchParams | null>(null)
  const priceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => {
    setLocalSelected(selected)
    pendingQuery.current = new URLSearchParams(window.location.search)
  }, [selected])
  useEffect(() => () => { Object.values(priceTimers.current).forEach(clearTimeout) }, [])
  const navigate = (next: URLSearchParams) => {
    next.delete("page")
    pendingQuery.current = next
    startTransition(() => router.replace(`/portal/account?${next}`, { scroll: false }))
  }
  const choose = (name: string, value: string, checked: boolean) => {
    const next = new URLSearchParams(pendingQuery.current?.toString() || window.location.search)
    if (["in_stock", "sustainable"].includes(name)) {
      if (checked) next.set(name, "true")
      else next.delete(name)
    } else {
      const values = next.getAll(name).filter((item) => item !== value)
      next.delete(name)
      if (checked) values.push(value)
      values.forEach((item) => next.append(name, item))
    }
    setLocalSelected((current) => ({ ...current, [name]: next.getAll(name) }))
    navigate(next)
  }
  const priceChanged = (name: string, value: string, immediate = false) => {
    if (priceTimers.current[name]) clearTimeout(priceTimers.current[name])
    const apply = () => {
      const next = new URLSearchParams(pendingQuery.current?.toString() || window.location.search)
      if (value.trim()) next.set(name, value)
      else next.delete(name)
      navigate(next)
    }
    if (immediate) apply()
    else priceTimers.current[name] = setTimeout(apply, 500)
  }
  const group = (title: string, name: string, items: Facet[]) => items.length ? <fieldset className={styles.facetGroup}>
    <legend>{title}</legend>
    {items.length > 10 && <input className={styles.facetSearch} type="search" aria-label={`Find ${title.toLowerCase()}`} placeholder={`Find ${title.toLowerCase()}…`} value={optionSearch[name] || ""} onChange={(event) => setOptionSearch((current) => ({ ...current, [name]: event.target.value }))} />}
    <div className={styles.facetOptions}>{items.filter((item) => item.value.toLocaleLowerCase().includes((optionSearch[name] || "").toLocaleLowerCase())).map((item) => <label key={item.value}><input type="checkbox" checked={localSelected[name]?.includes(item.value) || false} onChange={(event) => choose(name, item.value, event.target.checked)} /><span>{item.value}</span><small>{item.count.toLocaleString()}</small></label>)}</div>
  </fieldset> : null
  return <aside className={styles.filterColumn}>
    <button className={styles.mobileFilterButton} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Filters{activeCount ? ` (${activeCount})` : ""}</button>
    <div className={`${styles.catalogFilters} ${open ? styles.filtersOpen : ""}`}>
      <div className={styles.filterHeading}><strong>Filters</strong><Link href={clearHref}>Clear all</Link></div>
      {pending && <span className={styles.filterUpdating} aria-live="polite">Updating results…</span>}
      {group("Category", "category", facets.categories)}{group("Colour", "color", facets.colors)}{group("Material", "material", facets.materials)}{group("Brand", "brand", facets.brands)}{group("Lead time", "lead_time", facets.lead_times)}{group("Print technology", "print_method", facets.print_methods)}
      <fieldset className={styles.facetGroup}><legend>Price</legend><div className={styles.priceInputs}><input key={`min-${selected.min_price?.[0] || ""}`} aria-label="Minimum price" type="number" min="0" step="0.01" placeholder="Min €" defaultValue={selected.min_price?.[0]} onChange={(event) => priceChanged("min_price", event.target.value)} onBlur={(event) => priceChanged("min_price", event.target.value, true)} /><input key={`max-${selected.max_price?.[0] || ""}`} aria-label="Maximum price" type="number" min="0" step="0.01" placeholder="Max €" defaultValue={selected.max_price?.[0]} onChange={(event) => priceChanged("max_price", event.target.value)} onBlur={(event) => priceChanged("max_price", event.target.value, true)} /></div></fieldset>
      <fieldset className={styles.facetGroup}><legend>Availability</legend><div className={styles.facetOptions}><label><input type="checkbox" checked={localSelected.in_stock?.includes("true") || false} onChange={(event) => choose("in_stock", "true", event.target.checked)} /><span>In stock</span><small>{facets.availability.in_stock.toLocaleString()}</small></label><label><input type="checkbox" checked={localSelected.sustainable?.includes("true") || false} onChange={(event) => choose("sustainable", "true", event.target.checked)} /><span>Sustainable</span><small>{facets.availability.sustainable.toLocaleString()}</small></label></div></fieldset>
    </div>
  </aside>
}
