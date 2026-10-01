import { matchingCatalogVariants, type CatalogEntry, type CatalogFilters } from "./catalog-filtering"
import { compareSupplierPriority } from "./supplier-priority"

const names = new Intl.Collator()

export function recommendedCatalog(products: CatalogEntry[], priorities: ReadonlyMap<string, number>) {
  return products.sort((left, right) => compareSupplierPriority((left as any).supplier_id, (right as any).supplier_id, priorities) || names.compare(left.name, right.name))
}

// Prepared rows already have recommended ordering. Never sort all products
// again just to return the first 24 cards on a cold browser visit.
export function orderCatalog(products: CatalogEntry[], filters: CatalogFilters, sort: string, priorities: ReadonlyMap<string, number>, searchScores?: Map<string, number>) {
  if (sort === "name_asc" || sort === "name_desc") return products.sort((left, right) => names.compare(left.name, right.name) * (sort === "name_desc" ? -1 : 1))
  if (sort === "price_asc" || sort === "price_desc") {
    const prices = new Map(products.map((product) => {
      const eligible = matchingCatalogVariants(product, filters).map((variant) => variant.price_eur).filter((price): price is number => typeof price === "number" && Number.isFinite(price))
      return [product, eligible.length ? Math.min(...eligible) : undefined] as const
    }))
    return products.sort((left, right) => sort === "price_asc"
      ? (prices.get(left) ?? Infinity) - (prices.get(right) ?? Infinity)
      : (prices.get(right) ?? -Infinity) - (prices.get(left) ?? -Infinity))
  }
  if (!filters.search || !searchScores) return products
  const term = filters.search.toLocaleLowerCase()
  const scores = new Map(products.map((product) => {
    const name = product.name.toLocaleLowerCase()
    const code = (product.filter_variants || []).some((variant) => String(variant.sku || "").toLocaleLowerCase() === term)
    return [product, Number(code) * 1000 + (name === term ? 500 : name.startsWith(term) ? 100 : name.includes(term) ? 25 : 0) + (searchScores.get(product.id!) || 0)] as const
  }))
  return products.sort((left, right) => compareSupplierPriority((left as any).supplier_id, (right as any).supplier_id, priorities) || scores.get(right)! - scores.get(left)! || names.compare(left.name, right.name))
}
