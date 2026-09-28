import { compareSupplierPriority, reorderedSupplierPriorities } from "../supplier-priority"

const suppliers = [
  { id: "stricker", code: "stricker", display_name: "Stricker", catalog_priority: 3 },
  { id: "midocean", code: "midocean", display_name: "Midocean", catalog_priority: 1 },
  { id: "makito", code: "makito", display_name: "Makito", catalog_priority: 2 },
]

describe("supplier catalogue priority", () => {
  it("moves a supplier to first place and shifts all other positions", () => {
    expect(reorderedSupplierPriorities(suppliers, "stricker", 1)).toEqual([
      { id: "stricker", code: "stricker", catalog_priority: 1 },
      { id: "midocean", code: "midocean", catalog_priority: 2 },
      { id: "makito", code: "makito", catalog_priority: 3 },
    ])
  })

  it("rejects invalid positions and unknown suppliers", () => {
    expect(() => reorderedSupplierPriorities(suppliers, "stricker", 0)).toThrow()
    expect(() => reorderedSupplierPriorities(suppliers, "stricker", 4)).toThrow()
    expect(() => reorderedSupplierPriorities(suppliers, "missing", 1)).toThrow()
  })

  it("orders matching products by supplier before relevance", () => {
    const priorities = new Map([["stricker", 1], ["makito", 2]])
    expect(compareSupplierPriority("stricker", "makito", priorities)).toBeLessThan(0)
    expect(compareSupplierPriority("stricker", "stricker", priorities)).toBe(0)
  })
})
