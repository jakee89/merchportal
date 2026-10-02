import { facetSchema, facetTransport } from "../catalog-facet-transport"

describe("lossless private filter dictionary transport", () => {
  const base = { categories: [{ value: "Bags", count: 4 }], colors: [{ value: "Blue", count: 2 }], sizes: [], materials: [], brands: [], lead_times: [], print_methods: [], category_tree: { roots: [{ value: "Bags", count: 4, children: [{ value: "Bags > Backpacks", label: "Backpacks", count: 3 }] }] }, availability: { in_stock: 4, out_of_stock: 0, sustainable: 1 } }
  it("sends labels once, then counts only, without changing counts or revision identity", () => {
    const schema = facetSchema(base)
    const first = facetTransport(schema, base)
    expect(first.schema).toBeDefined()
    const second = facetTransport(schema, { ...base, colors: [{ value: "Blue", count: 0 }] }, schema.schema.id)
    expect(second.schema).toBeUndefined()
    expect(second.counts?.colors).toEqual([[schema.ids.get("Blue"), 0]])
    expect(second.counts?.category_tree).toEqual([[schema.ids.get("Bags"), 4], [schema.ids.get("Bags > Backpacks"), 3]])
    expect(facetSchema({ ...base, availability: { in_stock: 0 } }).schema.id).toBe(schema.schema.id)
    expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(first).length)
  })
  it("retains unknown selected labels with zero counts without corrupting the dictionary", () => {
    expect(facetTransport(facetSchema(base), { ...base, colors: [{ value: "Deleted colour", count: 0 }] }).facets?.colors).toEqual([["Deleted colour", 0]])
  })
})
