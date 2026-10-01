"use client"

import { useState } from "react"
import type { Facets } from "./catalog-filters"
import styles from "../../portal-shell.module.css"

export default function CategoryNavigation({ tree, selected, choose }: { tree: NonNullable<Facets["category_tree"]>; selected: string[]; choose: (name: string, value: string, checked: boolean) => void }) {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [limit, setLimit] = useState(40)
  const query = search.trim().toLocaleLowerCase()
  const roots = tree.roots.filter((root) => root.value.toLocaleLowerCase().includes(query) || root.children.some((child) => child.label.toLocaleLowerCase().includes(query)))
  const option = (value: string, label: string, count: number) => <label><input type="checkbox" checked={selected.includes(value)} onChange={(event) => choose("category", value, event.target.checked)} /><span>{label}</span><small>{count.toLocaleString()}</small></label>
  return <fieldset className={styles.facetGroup}><legend>Category</legend>
    <input className={styles.facetSearch} type="search" aria-label="Find categories" placeholder="Find categories…" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(40) }} />
    <div className={styles.facetOptions}>{roots.slice(0, limit).map((root) => {
      const open = Boolean(query || (expanded[root.value] ?? root.children.some((child) => selected.includes(child.value))))
      return <div key={root.value}><div className={styles.categoryRoot}>{root.children.length > 0 && <button type="button" aria-label={`${open ? "Collapse" : "Expand"} ${root.value}`} aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [root.value]: !open }))}>{open ? "−" : "+"}</button>}{option(root.value, root.value, root.count)}</div>
        {open && <div className={styles.categoryChildren}>{root.children.filter((child) => root.value.toLocaleLowerCase().includes(query) || child.label.toLocaleLowerCase().includes(query)).map((child) => <div key={child.value}>{option(child.value, child.label, child.count)}</div>)}</div>}
      </div>
    })}{!roots.length && <small>No matching categories</small>}{roots.length > limit && <button type="button" onClick={() => setLimit(limit + 40)}>Show more categories</button>}</div>
  </fieldset>
}
