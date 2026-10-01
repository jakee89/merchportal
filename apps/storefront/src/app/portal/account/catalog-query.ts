export const catalogFilterKeys = ["category", "color", "size", "material", "brand", "lead_time", "print_method", "min_price", "max_price", "in_stock", "out_of_stock", "sustainable"]
export const catalogQueryKeys = [...catalogFilterKeys, "q", "sort", "page"]

export function catalogQuery(input: URLSearchParams) {
  const result = new URLSearchParams()
  for (const key of catalogQueryKeys) {
    const values = Array.from(new Set(input.getAll(key).map((value) => value.trim()).filter(Boolean))).slice(0, 100)
    if (values.some((value) => value.length > 2000)) throw new Error("Filter value is too long")
    values.forEach((value) => result.append(key, value))
  }
  return result
}

export function selectedCatalogFilters(query: URLSearchParams) {
  return Object.fromEntries([...catalogFilterKeys, "q", "sort"].map((key) => [key, query.getAll(key)]))
}
