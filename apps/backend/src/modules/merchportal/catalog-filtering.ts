export type CatalogFilters = {
  search: string
  searchMatches?: ReadonlySet<string>
  categories: string[]
  colors: string[]
  sizes: string[]
  materials: string[]
  brands: string[]
  leadTimes: string[]
  printMethods: string[]
  minPrice?: number
  maxPrice?: number
  inStock: boolean
  outOfStock: boolean
  sustainable: boolean
}

type FilterKey = "category" | "color" | "size" | "material" | "brand" | "lead_time" | "print_method" | "price" | "in_stock" | "out_of_stock" | "sustainable"

export type CatalogEntry = {
  id?: string
  name: string
  search_text?: string
  description?: string
  sku?: string
  category?: string
  category_hierarchy?: string[]
  category_paths?: string[][]
  colors?: string[]
  materials?: string[]
  brand?: string
  lead_time?: string
  print_methods?: string[]
  keywords?: string[]
  sustainable?: boolean
  price_eur?: number
  stock_quantity?: number
  filter_variants?: Array<{ sku?: string; color?: string; color_group?: string; size?: string; price_eur?: number; stock_quantity?: number }>
}

export function colorLabel(value: string) {
  return value.replace(/^\s*\d+(?:[./]\d+)?\s*[-–]\s*/u, "").trim()
}

export function catalogSearchText(product: CatalogEntry) {
  return [product.name, product.description, product.sku, product.category, ...(product.category_hierarchy || []), product.brand, ...(product.keywords || []), ...(product.materials || []), ...(product.colors || []), ...(product.print_methods || []), ...(product.filter_variants || []).flatMap((variant) => [variant.sku, variant.color, variant.color_group, variant.size])].filter(Boolean).join(" ").toLocaleLowerCase()
}

const codeIndexes = new WeakMap<CatalogEntry[], { skus: string[]; ids: Map<string, Set<string>> }>()

export function catalogCodeMatches(products: CatalogEntry[], input: string): Set<string> | undefined {
  const code = input.trim().toLocaleLowerCase()
  if (code.length < 4 || !/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u.test(code) || !/\d/u.test(code)) return
  let index = codeIndexes.get(products)
  if (!index) {
    const ids = new Map<string, Set<string>>()
    for (const product of products) {
      if (!product.id) continue
      for (const value of [product.sku, ...(product.filter_variants || []).map((variant) => variant.sku)]) {
        if (!value) continue
        const sku = value.toLocaleLowerCase()
        if (!ids.has(sku)) ids.set(sku, new Set())
        ids.get(sku)!.add(product.id)
      }
    }
    index = { skus: [...ids.keys()].sort(), ids }
    codeIndexes.set(products, index)
  }
  let low = 0
  let high = index.skus.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (index.skus[middle] < code) low = middle + 1
    else high = middle
  }
  const exact = new Set<string>()
  const prefix = new Set<string>()
  for (let offset = low; offset < index.skus.length && index.skus[offset].startsWith(code); offset++) {
    const sku = index.skus[offset]
    for (const id of index.ids.get(sku)!) {
      prefix.add(id)
      if (sku === code || sku.startsWith(`${code}-`) || sku.startsWith(`${code}/`)) exact.add(id)
    }
  }
  return exact.size ? exact : prefix
}

function colorKey(value: string) {
  return colorLabel(value).toLocaleLowerCase()
}

function variantMatches(variant: NonNullable<CatalogEntry["filter_variants"]>[number], product: CatalogEntry, filters: CatalogFilters, excluded?: FilterKey) {
  if (excluded !== "color" && filters.colors.length && !filters.colors.some((color) => [variant.color, variant.color_group].filter(Boolean).some((value) => colorKey(value!) === colorKey(color)))) return false
  if (excluded !== "size" && filters.sizes.length && !filters.sizes.includes(variant.size || "")) return false
  const price = variant.price_eur ?? product.price_eur
  if (excluded !== "price" && filters.minPrice !== undefined && (price === undefined || price < filters.minPrice)) return false
  if (excluded !== "price" && filters.maxPrice !== undefined && (price === undefined || price > filters.maxPrice)) return false
  if (excluded !== "in_stock" && filters.inStock && !((variant.stock_quantity ?? product.stock_quantity ?? 0) > 0)) return false
  if (excluded !== "out_of_stock" && filters.outOfStock && (variant.stock_quantity ?? product.stock_quantity) !== 0) return false
  return true
}

function eligibleVariants(product: CatalogEntry, filters: CatalogFilters, excluded?: FilterKey) {
  const variants = product.filter_variants?.length ? product.filter_variants : [{ color: product.colors?.[0], price_eur: product.price_eur, stock_quantity: product.stock_quantity }]
  return variants.filter((variant) => variantMatches(variant, product, filters, excluded))
}

export function matchingCatalogVariants(product: CatalogEntry, filters: CatalogFilters) {
  return eligibleVariants(product, filters)
}

function selected(values: string[], available: string[]) {
  return !values.length || values.some((value) => available.includes(value))
}

export function categoryValues(product: CatalogEntry) {
  return [...(product.category_hierarchy || [product.category || ""]), ...(product.category_paths || []).map((path) => path.join(" > "))]
}

export function matchesCatalogFilters(product: CatalogEntry, filters: CatalogFilters, excluded?: FilterKey) {
  const search = filters.search.toLocaleLowerCase()
  if (search && (filters.searchMatches ? !product.id || !filters.searchMatches.has(product.id) : !(product.search_text || catalogSearchText(product)).includes(search))) return false
  if (excluded !== "category" && !selected(filters.categories, categoryValues(product))) return false
  if (excluded !== "material" && !selected(filters.materials, product.materials || [])) return false
  if (excluded !== "brand" && !selected(filters.brands, [product.brand || ""])) return false
  if (excluded !== "lead_time" && !selected(filters.leadTimes, [product.lead_time || ""])) return false
  if (excluded !== "print_method" && !selected(filters.printMethods, product.print_methods || [])) return false
  if (excluded !== "sustainable" && filters.sustainable && !product.sustainable) return false
  return eligibleVariants(product, filters, excluded).length > 0
}

function addFacet(counts: Map<string, number>, values: string[]) {
  for (const value of new Set(values.filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1)
}

function finishFacet(counts: Map<string, number>, selectedValues: string[] = []) {
  for (const value of selectedValues) if (!counts.has(value)) counts.set(value, 0)
  return [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => left.value.localeCompare(right.value))
}

export function catalogFacets(products: CatalogEntry[], filters: CatalogFilters) {
  const counts = {
    categories: new Map<string, number>(),
    colors: new Map<string, number>(),
    sizes: new Map<string, number>(),
    materials: new Map<string, number>(),
    brands: new Map<string, number>(),
    leadTimes: new Map<string, number>(),
    printMethods: new Map<string, number>(),
  }
  const availability = { in_stock: 0, out_of_stock: 0, sustainable: 0 }
  const branches = new Map<string, { count: number; children: Map<string, number> }>()
  const search = filters.search.toLocaleLowerCase()
  const availabilityFilters = { ...filters, inStock: false, outOfStock: false }
  for (const product of products) {
    if (search && (filters.searchMatches ? !product.id || !filters.searchMatches.has(product.id) : !(product.search_text || catalogSearchText(product)).includes(search))) continue
    const categoryMatch = selected(filters.categories, categoryValues(product))
    const materialMatch = selected(filters.materials, product.materials || [])
    const brandMatch = selected(filters.brands, [product.brand || ""])
    const leadTimeMatch = selected(filters.leadTimes, [product.lead_time || ""])
    const printMethodMatch = selected(filters.printMethods, product.print_methods || [])
    const sustainableMatch = !filters.sustainable || Boolean(product.sustainable)
    const failures = Number(!categoryMatch) + Number(!materialMatch) + Number(!brandMatch) + Number(!leadTimeMatch) + Number(!printMethodMatch) + Number(!sustainableMatch)
    const matchesExcept = (included: boolean) => failures === 0 || (failures === 1 && !included)
    const variants = eligibleVariants(product, filters)
    if (variants.length) {
      if (matchesExcept(categoryMatch)) {
        addFacet(counts.categories, product.category_hierarchy || [product.category || ""])
        const paths = product.category_paths?.length ? product.category_paths : (product.category_hierarchy || [product.category || ""]).filter(Boolean).map((value) => [value])
        const roots = new Set<string>()
        const children = new Set<string>()
        for (const path of paths) {
          if (!path[0]) continue
          let branch = branches.get(path[0])
          if (!branch) branches.set(path[0], branch = { count: 0, children: new Map() })
          if (!roots.has(path[0])) { branch.count++; roots.add(path[0]) }
          const value = path.join(" > ")
          if (path.length > 1 && !children.has(value)) { addFacet(branch.children, [value]); children.add(value) }
        }
      }
      if (matchesExcept(materialMatch)) addFacet(counts.materials, product.materials || [])
      if (matchesExcept(brandMatch)) addFacet(counts.brands, [product.brand || ""])
      if (matchesExcept(leadTimeMatch)) addFacet(counts.leadTimes, [product.lead_time || ""])
      if (matchesExcept(printMethodMatch)) addFacet(counts.printMethods, product.print_methods || [])
      if (matchesExcept(sustainableMatch) && product.sustainable) availability.sustainable++
    }
    if (failures) continue
    const colorVariants = eligibleVariants(product, filters, "color")
    if (colorVariants.length) addFacet(counts.colors, colorVariants.map((variant) => colorLabel(variant.color_group || variant.color || "")))
    const sizeVariants = eligibleVariants(product, filters, "size")
    if (sizeVariants.length) addFacet(counts.sizes, sizeVariants.map((variant) => variant.size || "").filter((value) => value !== "Standard" && value !== "000"))
    const availableVariants = eligibleVariants(product, availabilityFilters)
    if (availableVariants.length) {
      if (availableVariants.some((variant) => (variant.stock_quantity ?? product.stock_quantity ?? 0) > 0)) availability.in_stock++
      if (availableVariants.some((variant) => (variant.stock_quantity ?? product.stock_quantity) === 0)) availability.out_of_stock++
    }
  }
  for (const value of filters.categories) {
    const [root, ...child] = value.split(" > ")
    if (!branches.has(root)) branches.set(root, { count: 0, children: new Map() })
    if (child.length && !branches.get(root)!.children.has(value)) branches.get(root)!.children.set(value, 0)
  }
  return {
    category_tree: { roots: [...branches].sort(([a], [b]) => a.localeCompare(b)).map(([value, branch]) => ({ value, count: branch.count, children: finishFacet(branch.children).map((child) => ({ ...child, label: child.value.split(" > ").slice(1).join(" > ") })) })) },
    categories: finishFacet(counts.categories, filters.categories),
    colors: finishFacet(counts.colors, filters.colors.map(colorLabel)),
    sizes: finishFacet(counts.sizes, filters.sizes),
    materials: finishFacet(counts.materials, filters.materials),
    brands: finishFacet(counts.brands, filters.brands),
    lead_times: finishFacet(counts.leadTimes, filters.leadTimes),
    print_methods: finishFacet(counts.printMethods, filters.printMethods),
    availability,
  }
}
