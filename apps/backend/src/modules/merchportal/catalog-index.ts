import { colorLabel, type CatalogEntry, type CatalogFilters } from "./catalog-filtering"

type Index = { products: Map<string, CatalogEntry>; order: Map<string, number>; values: Map<string, Map<string, Set<string>>> }
const indexes = new WeakMap<CatalogEntry[], Index>()
const colorKey = (value: string) => colorLabel(value).toLocaleLowerCase()

function indexFor(products: CatalogEntry[]) {
  const existing = indexes.get(products)
  if (existing) return existing
  const index: Index = { products: new Map(), order: new Map(), values: new Map() }
  for (const product of products) {
    if (!product.id) continue
    index.products.set(product.id, product)
    index.order.set(product.id, index.order.size)
    const variants = product.filter_variants?.length ? product.filter_variants : [{ color: product.colors?.[0] }]
    const fields: Record<string, string[]> = {
      categories: product.category_hierarchy || [product.category || ""],
      materials: product.materials || [],
      brands: [product.brand || ""],
      leadTimes: [product.lead_time || ""],
      printMethods: product.print_methods || [],
      colors: variants.flatMap((variant) => [variant.color, variant.color_group].filter((value): value is string => Boolean(value))).map(colorKey),
      sizes: variants.map((variant) => variant.size || ""),
      sustainable: product.sustainable ? ["true"] : [],
    }
    for (const [field, values] of Object.entries(fields)) {
      let lookup = index.values.get(field)
      if (!lookup) index.values.set(field, lookup = new Map())
      for (const value of new Set(values)) {
        let ids = lookup.get(value)
        if (!ids) lookup.set(value, ids = new Set())
        ids.add(product.id)
      }
    }
  }
  indexes.set(products, index)
  return index
}

// A conservative shortlist, not a replacement for exact same-variant/price/stock checks.
// Facets exclude their own selection, so retain rows failing at most one indexed field.
export function catalogCandidates(products: CatalogEntry[], filters: CatalogFilters, facets = false): CatalogEntry[] {
  const index = indexFor(products)
  const constraints: Set<string>[] = []
  const selected: Record<string, string[]> = {
    categories: filters.categories, colors: filters.colors.map(colorKey), sizes: filters.sizes,
    materials: filters.materials, brands: filters.brands, leadTimes: filters.leadTimes,
    printMethods: filters.printMethods, sustainable: filters.sustainable ? ["true"] : [],
  }
  for (const [field, values] of Object.entries(selected)) {
    if (!values.length) continue
    const ids = new Set<string>()
    for (const value of values) for (const id of index.values.get(field)?.get(value) || []) ids.add(id)
    constraints.push(ids)
  }
  constraints.sort((a, b) => a.size - b.size)
  let ids: Iterable<string>
  if (filters.searchMatches) ids = filters.searchMatches
  else if (!constraints.length || (facets && constraints.length === 1)) return products
  else if (facets) ids = new Set([...constraints[0], ...constraints[1]])
  else ids = constraints[0]
  const candidates: CatalogEntry[] = []
  for (const id of ids) {
    const product = index.products.get(id)
    if (!product) continue
    let failures = 0
    for (const constraint of constraints) {
      if (!constraint.has(id)) failures++
      if (failures > (facets ? 1 : 0)) break
    }
    if (failures <= (facets ? 1 : 0)) candidates.push(product)
  }
  return candidates.sort((left, right) => index.order.get(left.id!)! - index.order.get(right.id!)!)
}
