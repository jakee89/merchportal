import { catalogFacets, matchesCatalogFilters, type CatalogEntry, type CatalogFilters } from "../catalog-filtering"

const products: CatalogEntry[] = [
  {
    name: "Travel backpack",
    category_hierarchy: ["Bags", "Backpacks"],
    materials: ["Polyester"],
    filter_variants: [
      { sku: "B-BLK", color: "300 - Black", price_eur: 10, stock_quantity: 4 },
      { sku: "B-RED", color: "Red", price_eur: 8, stock_quantity: 0 },
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
  materials: [],
  brands: [],
  leadTimes: [],
  printMethods: [],
  inStock: false,
  sustainable: false,
}

describe("client catalogue facets", () => {
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
})
