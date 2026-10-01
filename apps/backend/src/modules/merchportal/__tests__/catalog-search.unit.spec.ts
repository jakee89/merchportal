import { catalogSearchScores, searchCatalog } from "../catalog-search"
import { portalReadCache } from "../read-cache"

function database(rows: Array<{ product_id: string; rank: number }>) {
  const conditions: string[] = []
  const builder: any = {}
  for (const method of ["select", "whereNull", "whereNotNull"]) builder[method] = jest.fn(() => builder)
  builder.whereRaw = jest.fn((sql: string) => { conditions.push(sql); return builder })
  builder.orWhereRaw = jest.fn((sql: string) => { conditions.push(sql); return builder })
  builder.where = jest.fn((callback: Function) => { callback.call(builder); return builder })
  builder.then = (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject)
  const knex: any = jest.fn(() => builder)
  knex.raw = jest.fn((sql: string) => sql)
  return { container: { resolve: () => knex }, conditions }
}

describe("full supplier search without loose result pollution", () => {
  beforeEach(() => portalReadCache.clear())
  it("uses parameterized full-text and literal matching without broad similarity eligibility", async () => {
    const { container, conditions } = database([{ product_id: "bag", rank: 0.2 }])
    expect(await catalogSearchScores(container, "backpack")).toEqual(new Map([["bag", 0.2]]))
    expect(conditions.join(" ")).toContain("websearch_to_tsquery")
    expect(conditions.join(" ")).toContain("ilike ?")
    expect(conditions.join(" ")).not.toMatch(/<%|similarity/u)
  })
  it("preserves real matches in full supplier descriptions beyond the short card preview", async () => {
    const { container } = database([{ product_id: "model", rank: 0.2 }, { product_id: "not-in-client-catalog", rank: 0.3 }])
    const products = [{ id: "model", name: "Oslo", description: "Carry your essentials", category: "Bags" }]
    expect([...await searchCatalog(container, products, "backpack", "test-full-description")]).toEqual([["model", 0.2]])
    expect([...await searchCatalog(container, products, "backpack", "test-full-description", true)]).toEqual([["model", 0.2]])
  })
  it("never fuzzily expands complete or partial product codes", async () => {
    const { container } = database([{ product_id: "shirt", rank: 100 }])
    const products = [{ id: "bag", name: "Backpack", sku: "92147-131" }, { id: "shirt", name: "Shirt", sku: "92145-103" }]
    expect([...await searchCatalog(container, products, "92147", "test-code")]).toEqual([["bag", 1000]])
    expect((await searchCatalog(container, products, "92149", "test-code")).size).toBe(0)
  })
})
