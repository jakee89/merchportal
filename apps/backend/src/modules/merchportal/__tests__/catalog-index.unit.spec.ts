import { catalogCandidates } from "../catalog-index"
import { catalogCodeMatches, catalogFacets, matchesCatalogFilters, type CatalogEntry, type CatalogFilters } from "../catalog-filtering"

const base: CatalogFilters = { search: "", categories: [], colors: [], sizes: [], materials: [], brands: [], leadTimes: [], printMethods: [], inStock: false, outOfStock: false, sustainable: false }
const products: CatalogEntry[] = Array.from({ length: 300 }, (_, index) => ({
  id: `p-${index}`, name: `Product ${index}`, category_hierarchy: ["Gifts", index % 2 ? "Bags" : "Pens"],
  materials: [index % 3 ? "Cotton" : "Metal"], brand: index % 5 ? "Brand A" : "Brand B", lead_time: "5 days",
  print_methods: ["Screen", ...(index % 3 ? ["Laser"] : [])], sustainable: index % 4 === 0,
  stock_quantity: index % 3, price_eur: 10,
  filter_variants: [
    { sku: `MO${10000 + index}-03`, color: "300 - Black", color_group: "Dark", size: "S", price_eur: 5, stock_quantity: index % 3 },
    { sku: `MO${10000 + index}-05`, color: "Blue", size: "L", price_eur: 12, stock_quantity: 0 },
  ],
}))

describe("catalogue candidate index", () => {
  it("scopes a child to its parent and counts shared branches once per product", () => {
    const rows = [
      { id: "a", name: "A", category_hierarchy: ["Bags", "Travel", "Backpacks"], category_paths: [["Bags", "Backpacks"], ["Bags", "Totes"]] },
      { id: "b", name: "B", category_hierarchy: ["School", "Backpacks"], category_paths: [["School", "Backpacks"]] },
    ]
    const filters = { ...base, categories: ["Bags > Backpacks"] }
    expect(catalogCandidates(rows, filters).filter((row) => matchesCatalogFilters(row, filters)).map((row) => row.id)).toEqual(["a"])
    expect(catalogFacets(rows, filters).category_tree.roots).toEqual([
      { value: "Bags", count: 1, children: [{ value: "Bags > Backpacks", label: "Backpacks", count: 1 }, { value: "Bags > Totes", label: "Totes", count: 1 }] },
      { value: "School", count: 1, children: [{ value: "School > Backpacks", label: "Backpacks", count: 1 }] },
    ])
    expect(catalogFacets([], filters).category_tree.roots[0].children[0].count).toBe(0)
  })
  it("preserves results and self-excluding facet counts for combined filters", () => {
    for (let index = 0; index < 200; index++) {
      const filters: CatalogFilters = {
        ...base, categories: index % 2 ? ["Bags"] : [], colors: index % 3 ? ["black", "Dark"] : [],
        sizes: index % 4 ? ["L"] : [], materials: index % 5 ? ["Metal"] : [],
        brands: index % 7 ? ["Brand B"] : [], leadTimes: index % 11 ? ["5 days"] : [],
        printMethods: index % 13 ? ["Laser"] : [], sustainable: index % 3 === 0,
        minPrice: index % 2 ? 6 : undefined, maxPrice: index % 4 ? 10 : undefined,
        inStock: index % 5 === 0, outOfStock: index % 7 === 0,
        ...(index % 9 === 0 ? { search: "plurals", searchMatches: new Set(["p-0", "p-3", "p-8", "missing"]) } : {}),
      }
      expect(catalogCandidates(products, filters).filter((item) => matchesCatalogFilters(item, filters))).toEqual(products.filter((item) => matchesCatalogFilters(item, filters)))
      expect(catalogFacets(catalogCandidates(products, filters, true), filters)).toEqual(catalogFacets(products, filters))
    }
  })

  it("shortlists only exact code matches and preserves the zero-results case", () => {
    const searchMatches = catalogCodeMatches(products, "MO10020")!
    expect([...searchMatches]).toEqual(["p-20"])
    expect(catalogCandidates(products, { ...base, search: "MO10020", searchMatches }, true)).toHaveLength(1)
    expect(catalogCandidates(products, { ...base, search: "MO99999", searchMatches: catalogCodeMatches(products, "MO99999") }, true)).toEqual([])
  })

  it("handles fallback variants, unknown stock, mapped colours and empty facets", () => {
    const fallback = [{ id: "fallback", name: "Fallback", colors: ["300 - Black"], price_eur: 5 }, ...products]
    for (const filters of [{ ...base, colors: ["Black"] }, { ...base, sizes: ["missing"] }, { ...base, colors: ["Dark"], outOfStock: true }]) {
      expect(catalogFacets(catalogCandidates(fallback, filters, true), filters)).toEqual(catalogFacets(fallback, filters))
      expect(catalogCandidates(fallback, filters).filter((item) => matchesCatalogFilters(item, filters))).toEqual(fallback.filter((item) => matchesCatalogFilters(item, filters)))
    }
  })
})
