export type CatalogFilters = {
  search: string
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
  name: string
  search_text?: string
  description?: string
  sku?: string
  category?: string
  category_hierarchy?: string[]
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
  return [product.name, product.description, product.sku, product.category, ...(product.category_hierarchy || []), product.brand, ...(product.keywords || []), ...(product.filter_variants || []).map((variant) => variant.sku)].filter(Boolean).join(" ").toLocaleLowerCase()
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

export function matchesCatalogFilters(product: CatalogEntry, filters: CatalogFilters, excluded?: FilterKey) {
  const search = filters.search.toLocaleLowerCase()
  if (search && !(product.search_text || catalogSearchText(product)).includes(search)) return false
  if (excluded !== "category" && !selected(filters.categories, product.category_hierarchy || [product.category || ""])) return false
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
  const search = filters.search.toLocaleLowerCase()
  const availabilityFilters = { ...filters, inStock: false, outOfStock: false }
  for (const product of products) {
    if (search && !(product.search_text || catalogSearchText(product)).includes(search)) continue
    const categoryMatch = selected(filters.categories, product.category_hierarchy || [product.category || ""])
    const materialMatch = selected(filters.materials, product.materials || [])
    const brandMatch = selected(filters.brands, [product.brand || ""])
    const leadTimeMatch = selected(filters.leadTimes, [product.lead_time || ""])
    const printMethodMatch = selected(filters.printMethods, product.print_methods || [])
    const sustainableMatch = !filters.sustainable || Boolean(product.sustainable)
    const failures = Number(!categoryMatch) + Number(!materialMatch) + Number(!brandMatch) + Number(!leadTimeMatch) + Number(!printMethodMatch) + Number(!sustainableMatch)
    const matchesExcept = (included: boolean) => failures === 0 || (failures === 1 && !included)
    const variants = eligibleVariants(product, filters)
    if (variants.length) {
      if (matchesExcept(categoryMatch)) addFacet(counts.categories, product.category_hierarchy || [product.category || ""])
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
  return {
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
