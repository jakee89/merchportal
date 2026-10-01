import { recommendedCatalog, orderCatalog } from "../catalog-ordering"
import type { CatalogFilters } from "../catalog-filtering"

const filters: CatalogFilters = { search: "", categories: [], colors: [], sizes: [], materials: [], brands: [], leadTimes: [], printMethods: [], inStock: false, outOfStock: false, sustainable: false }
const priorities = new Map([["first", 1], ["second", 2]])
const products: any[] = [
  { id: "b", name: "Backpack Z", supplier_id: "second", filter_variants: [{ sku: "92145", color: "Black", price_eur: 2 }, { sku: "92145-B", color: "Blue", price_eur: 20 }] },
  { id: "a", name: "Backpack A", supplier_id: "first", filter_variants: [{ sku: "92147", color: "Black", price_eur: 10 }] },
  { id: "c", name: "Backpack C", supplier_id: "first", filter_variants: [{ sku: "92148", color: "Blue", price_eur: 4 }] },
]

it("prepares recommended order once and returns it untouched for normal browsing", () => {
  const prepared = recommendedCatalog([...products], priorities)
  expect(prepared.map((product) => product.id)).toEqual(["a", "c", "b"])
  expect(orderCatalog(prepared, filters, "", priorities)).toBe(prepared)
  const sort = jest.spyOn(prepared, "sort")
  orderCatalog(prepared, filters, "", priorities)
  expect(sort).not.toHaveBeenCalled()
})

it("preserves alphabetical sorting and matching-variant prices, with unpriced products last", () => {
  expect(orderCatalog([...products], filters, "name_desc", priorities).map((product) => product.id)).toEqual(["b", "c", "a"])
  const rows = [products[0], products[2], { id: "unpriced", name: "Unavailable" }]
  expect(orderCatalog([...rows], { ...filters, colors: ["Blue"] }, "price_asc", priorities).map((product) => product.id)).toEqual(["c", "b", "unpriced"])
  expect(orderCatalog([...rows], { ...filters, colors: ["Blue"] }, "price_desc", priorities).map((product) => product.id)).toEqual(["b", "c", "unpriced"])
})

it("preserves supplier priority before search relevance, without re-tokenizing inside sorting", () => {
  const scores = new Map([["a", 1], ["b", 1000], ["c", 10]])
  expect(orderCatalog([...products], { ...filters, search: "backpack" }, "", priorities, scores).map((product) => product.id)).toEqual(["c", "a", "b"])
})
