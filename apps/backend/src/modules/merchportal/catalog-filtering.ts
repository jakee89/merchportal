export type CatalogFilters = {
  search: string
  categories: string[]
  colors: string[]
  materials: string[]
  brands: string[]
  leadTimes: string[]
  printMethods: string[]
  minPrice?: number
  maxPrice?: number
  inStock: boolean
  sustainable: boolean
}

type FilterKey = "category" | "color" | "material" | "brand" | "lead_time" | "print_method" | "price" | "in_stock" | "sustainable"

export type CatalogEntry = {
  name: string
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
  filter_variants?: Array<{ sku?: string; color?: string; color_group?: string; price_eur?: number; stock_quantity?: number }>
}

export function colorLabel(value: string) {
  return value.replace(/^\s*\d+(?:[./]\d+)?\s*[-–]\s*/u, "").trim()
}

function colorKey(value: string) {
  return colorLabel(value).toLocaleLowerCase()
}

function variantMatches(variant: NonNullable<CatalogEntry["filter_variants"]>[number], product: CatalogEntry, filters: CatalogFilters, excluded?: FilterKey) {
  if (excluded !== "color" && filters.colors.length && !filters.colors.some((color) => [variant.color, variant.color_group].filter(Boolean).some((value) => colorKey(value!) === colorKey(color)))) return false
  const price = variant.price_eur ?? product.price_eur
  if (excluded !== "price" && filters.minPrice !== undefined && (price === undefined || price < filters.minPrice)) return false
  if (excluded !== "price" && filters.maxPrice !== undefined && (price === undefined || price > filters.maxPrice)) return false
  if (excluded !== "in_stock" && filters.inStock && !((variant.stock_quantity ?? product.stock_quantity ?? 0) > 0)) return false
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
  if (search && ![product.name, product.description, product.sku, product.category, ...(product.category_hierarchy || []), product.brand, ...(product.keywords || []), ...(product.filter_variants || []).map((variant) => variant.sku)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search)) return false
  if (excluded !== "category" && !selected(filters.categories, product.category_hierarchy || [product.category || ""])) return false
  if (excluded !== "material" && !selected(filters.materials, product.materials || [])) return false
  if (excluded !== "brand" && !selected(filters.brands, [product.brand || ""])) return false
  if (excluded !== "lead_time" && !selected(filters.leadTimes, [product.lead_time || ""])) return false
  if (excluded !== "print_method" && !selected(filters.printMethods, product.print_methods || [])) return false
  if (excluded !== "sustainable" && filters.sustainable && !product.sustainable) return false
  return eligibleVariants(product, filters, excluded).length > 0
}

function facet(products: CatalogEntry[], values: (product: CatalogEntry) => string[], selectedValues: string[] = []) {
  const counts = new Map<string, number>()
  for (const product of products) {
    for (const value of new Set(values(product).filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1)
  }
  for (const value of selectedValues) if (!counts.has(value)) counts.set(value, 0)
  return [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => left.value.localeCompare(right.value))
}

export function catalogFacets(products: CatalogEntry[], filters: CatalogFilters) {
  const matching = (excluded: FilterKey) => products.filter((product) => matchesCatalogFilters(product, filters, excluded))
  return {
    categories: facet(matching("category"), (product) => product.category_hierarchy || [product.category || ""], filters.categories),
    colors: facet(matching("color"), (product) => eligibleVariants(product, filters, "color").map((variant) => colorLabel(variant.color_group || variant.color || "")), filters.colors.map(colorLabel)),
    materials: facet(matching("material"), (product) => product.materials || [], filters.materials),
    brands: facet(matching("brand"), (product) => [product.brand || ""], filters.brands),
    lead_times: facet(matching("lead_time"), (product) => [product.lead_time || ""], filters.leadTimes),
    print_methods: facet(matching("print_method"), (product) => product.print_methods || [], filters.printMethods),
    availability: {
      in_stock: matching("in_stock").filter((product) => eligibleVariants(product, filters, "in_stock").some((variant) => (variant.stock_quantity ?? product.stock_quantity ?? 0) > 0)).length,
      sustainable: matching("sustainable").filter((product) => product.sustainable).length,
    },
  }
}
