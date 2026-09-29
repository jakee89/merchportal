import { catalogCodeMatches, catalogFacets, catalogSearchText, matchesCatalogFilters, type CatalogEntry, type CatalogFilters } from "../catalog-filtering"

const products: CatalogEntry[] = [
  {
    name: "Travel backpack",
    category_hierarchy: ["Bags", "Backpacks"],
    materials: ["Polyester"],
    filter_variants: [
      { sku: "B-BLK", color: "300 - Black", size: "4-5", price_eur: 10, stock_quantity: 4 },
      { sku: "B-RED", color: "Red", size: "6-8", price_eur: 8, stock_quantity: 0 },
    ],
  },
  {
    name: "City backpack",
    category_hierarchy: ["Bags", "Backpacks"],
    materials: ["Cotton"],
    filter_variants: [{ sku: "C-BLK", color: "Black", price_eur: 18, stock_quantity: 0 }],
  },
  {
    name: "Cotton tote",
    category_hierarchy: ["Bags", "Totes"],
    materials: ["Cotton"],
    filter_variants: [{ sku: "T-BLK", color: "Black", price_eur: 12, stock_quantity: 8 }],
  },
]

const base: CatalogFilters = {
  search: "",
  categories: [],
  colors: [],
  sizes: [],
  materials: [],
  brands: [],
  leadTimes: [],
  printMethods: [],
  inStock: false,
  outOfStock: false,
  sustainable: false,
}

describe("client catalogue facets", () => {
  it("matches product codes without fuzzy neighbouring codes", () => {
    const coded = ["92147-131", "92145-133", "92148-104", "92146-103"].map((sku, index) => ({ id: `product-${index}`, name: sku, filter_variants: [{ sku }] }))
    expect([...catalogCodeMatches(coded, "92147")!]).toEqual(["product-0"])
    expect([...catalogCodeMatches(coded, "92147-1")!]).toEqual(["product-0"])
    expect([...catalogCodeMatches(coded, "92149")!]).toEqual([])
    expect(catalogCodeMatches(coded, "backpacks")).toBeUndefined()
  })

  it("uses the same search result with a precomputed catalogue search field", () => {
    const indexed = products.map((product) => ({ ...product, search_text: catalogSearchText(product) }))
    for (const search of ["backpack", "b-red", "polyester", "missing"]) {
      const filters = { ...base, search }
      expect(indexed.map((product) => matchesCatalogFilters(product, filters))).toEqual(products.map((product) => matchesCatalogFilters(product, filters)))
      expect(catalogFacets(indexed, filters)).toEqual(catalogFacets(products, filters))
    }
  })

  it("uses indexed matches for plurals and misspellings across products and facets", () => {
    const indexed = products.map((product, index) => ({ ...product, id: `product-${index}` }))
    const filters = { ...base, search: "backpaks", searchMatches: new Set(["product-0", "product-1"]) }
    expect(indexed.filter((product) => matchesCatalogFilters(product, filters)).map((product) => product.name)).toEqual(["Travel backpack", "City backpack"])
    expect(catalogFacets(indexed, filters).categories).toContainEqual({ value: "Backpacks", count: 2 })
  })

  it("indexes supplier keywords and product variation details", () => {
    const text = catalogSearchText({ name: "Gift set", keywords: ["Rulers"], materials: ["Bamboo"], print_methods: ["Laser engraving"], filter_variants: [{ sku: "RUL-01", color: "Blue", size: "Large" }] })
    for (const value of ["rulers", "bamboo", "laser engraving", "rul-01", "blue", "large"]) expect(text).toContain(value)
  })

  it("combines search, category, and cross-supplier colour names at the variant level", () => {
    const filters = { ...base, search: "backpack", categories: ["Backpacks"], colors: ["Black"] }
    expect(products.filter((product) => matchesCatalogFilters(product, filters)).map((product) => product.name)).toEqual(["Travel backpack", "City backpack"])
    expect(catalogFacets(products, filters).colors).toEqual(expect.arrayContaining([{ value: "Black", count: 2 }, { value: "Red", count: 1 }]))
    expect(catalogFacets(products, filters).categories).toEqual(expect.arrayContaining([{ value: "Backpacks", count: 2 }]))
  })

  it("recalculates each facet using the current price and stock filters", () => {
    const filters = { ...base, search: "backpack", minPrice: 9, maxPrice: 15, inStock: true }
    expect(products.filter((product) => matchesCatalogFilters(product, filters)).map((product) => product.name)).toEqual(["Travel backpack"])
    const facets = catalogFacets(products, filters)
    expect(facets.colors).toEqual([{ value: "Black", count: 1 }])
    expect(facets.materials).toEqual([{ value: "Polyester", count: 1 }])
    expect(facets.availability.in_stock).toBe(1)
  })

  it("does not use another colour variant's lower price for a black-only range", () => {
    const filters = { ...base, colors: ["Black"], maxPrice: 9 }
    expect(products.filter((product) => matchesCatalogFilters(product, filters))).toHaveLength(0)
    expect(catalogFacets(products, filters).colors).toEqual(expect.arrayContaining([{ value: "Black", count: 0 }, { value: "Red", count: 1 }]))
  })

  it("filters zero-stock variants separately from unknown stock", () => {
    const filters = { ...base, outOfStock: true }
    expect(products.filter((product) => matchesCatalogFilters(product, filters)).map((product) => product.name)).toEqual(["Travel backpack", "City backpack"])
    expect(catalogFacets(products, filters).availability.out_of_stock).toBe(2)
    expect(catalogFacets(products, filters).availability.in_stock).toBe(2)
  })

  it("filters size and colour on the same variant", () => {
    expect(products.filter((product) => matchesCatalogFilters(product, { ...base, colors: ["Black"], sizes: ["6-8"] }))).toHaveLength(0)
    expect(products.filter((product) => matchesCatalogFilters(product, { ...base, colors: ["Black"], sizes: ["4-5"] })).map((product) => product.name)).toEqual(["Travel backpack"])
    expect(catalogFacets(products, { ...base, colors: ["Black"] }).sizes).toEqual(expect.arrayContaining([{ value: "4-5", count: 1 }]))
  })
})
