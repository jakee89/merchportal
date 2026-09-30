import { applyFacetMappings, facetMappingIndex, facetMappingOptions, saveFacetMappings } from "../facet-mappings"
import { catalogFacets, matchesCatalogFilters, type CatalogFilters } from "../catalog-filtering"
import { validateMappingGroups } from "../facet-tools"

describe("supplier filter mappings", () => {
  it("replaces supplier ancestors with approved parents and keeps separate category branches", () => {
    const mappings = facetMappingIndex([
      { supplier_id: "makito", facet_type: "category", source_value: "Backpacks", target_value: "Bags & Travel > Backpacks" },
      { supplier_id: "makito", facet_type: "category", source_value: "Cool bags", target_value: "Outdoor & Leisure > Cooler bags" },
    ])
    const original = { name: "Cooler backpack", category: "Backpacks", category_hierarchy: ["Supplier bags", "Backpacks", "Cool bags"], category_paths: [["Supplier bags", "Backpacks"], ["Supplier outdoors", "Cool bags"]] }
    const mapped = applyFacetMappings(original, "makito", mappings)
    expect(mapped.category).toBe("Backpacks")
    expect(mapped.category_paths).toEqual([["Bags & Travel", "Backpacks"], ["Outdoor & Leisure", "Cooler bags"]])
    expect(mapped.category_hierarchy).toEqual(["Bags & Travel", "Backpacks", "Outdoor & Leisure", "Cooler bags"])
    expect(original.category_hierarchy).toContain("Supplier bags")
    const filters: CatalogFilters = { search: "", categories: [], colors: [], sizes: [], materials: [], brands: [], leadTimes: [], printMethods: [], inStock: false, outOfStock: false, sustainable: false }
    for (const category of mapped.category_hierarchy) expect(matchesCatalogFilters(mapped, { ...filters, categories: [category] })).toBe(true)
    expect(catalogFacets([mapped], filters).categories).toContainEqual({ value: "Bags & Travel", count: 1 })
    expect(matchesCatalogFilters(mapped, { ...filters, categories: ["Supplier bags"] })).toBe(false)
  })

  it("rejects empty, repeated and over-deep paths before mapping writes", () => {
    for (const target_value of ["Bags >", "Bags > Bags", "Products > Bags > Backpacks"]) expect(() => validateMappingGroups("category", [{ target_value, sources: [{ supplier_id: "makito", source_value: "Bags" }] }])).toThrow("Parent > Subcategory")
    expect(() => validateMappingGroups("category", [{ target_value: "Bags & Travel > Backpacks", sources: [{ supplier_id: "makito", source_value: "Backpacks" }] }])).not.toThrow()
  })
  it("maps colours and materials per supplier without changing source variants", () => {
    const mappings = facetMappingIndex([
      { supplier_id: "makito", facet_type: "color", source_value: "Marine", target_value: "Navy Blue" },
      { supplier_id: "stricker", facet_type: "color", source_value: "300 - Black", target_value: "Black" },
      { supplier_id: "makito", facet_type: "material", source_value: "RPET", target_value: "Recycled polyester" },
    ])
    const product = { materials: ["RPET"], filter_variants: [{ color: "Marine", color_group: "Marine" }] }
    expect(applyFacetMappings(product, "makito", mappings)).toMatchObject({ materials: ["Recycled polyester"], filter_variants: [{ color: "Marine", color_group: "Navy Blue" }] })
    expect(applyFacetMappings(product, "stricker", mappings).materials).toEqual(["RPET"])
    expect(applyFacetMappings({ filter_variants: [{ color: "300 - Black" }] }, "stricker", mappings).filter_variants?.[0]).toMatchObject({ color_group: "Black" })
  })

  it("saves one shared target for source values from different suppliers", async () => {
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "makito" }, { id: "stricker" }]),
      listFacetMappings: jest.fn().mockResolvedValue([]),
      createFacetMappings: jest.fn().mockResolvedValue({}),
    }
    await saveFacetMappings(service, { facet_type: "color", target_value: "Navy Blue", sources: [
      { supplier_id: "makito", source_value: "Marine" },
      { supplier_id: "stricker", source_value: "301 - Navy Blue" },
    ] })
    expect(service.createFacetMappings).toHaveBeenCalledTimes(2)
    expect(service.createFacetMappings).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: "makito", target_value: "Navy Blue" }))
  })

  it("maps categories and print technologies without changing source records", () => {
    const mappings = facetMappingIndex([
      { supplier_id: "makito", facet_type: "category", source_value: "Backpacks", target_value: "Bags" },
      { supplier_id: "makito", facet_type: "print_method", source_value: "SILK-SCREEN PRINT", target_value: "Screen printing" },
    ])
    const product = { category: "Backpacks", category_hierarchy: ["Bags", "Backpacks"], print_methods: ["SILK-SCREEN PRINT", "Screen printing"] }
    expect(applyFacetMappings(product, "makito", mappings)).toMatchObject({ category: "Bags", category_hierarchy: ["Bags"], print_methods: ["Screen printing"] })
    expect(product.print_methods).toEqual(["SILK-SCREEN PRINT", "Screen printing"])
  })

  it("lists Makito category levels and print methods as mappable options", async () => {
    const service = {
      listSuppliers: jest.fn().mockResolvedValue([{ id: "makito", code: "makito", display_name: "Makito" }]),
      listPublishedProductSources: jest.fn().mockResolvedValue([{ supplier_id: "makito", catalog_preview: {
        category_paths: ["Production > PRODUCTS > Backpacks > Travel Bags"],
        print_methods: ["SILK-SCREEN PRINT"],
      } }]),
      listFacetMappings: jest.fn().mockResolvedValue([]),
    }
    const options = await facetMappingOptions(service)
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ facet_type: "category", source_value: "Backpacks" }),
      expect.objectContaining({ facet_type: "print_method", source_value: "SILK-SCREEN PRINT" }),
    ]))
    expect(options.some((option) => option.source_value === "PRODUCTS")).toBe(false)
  })

  it("keeps saved maps visible even when their supplier value has no current products", async () => {
    const options = await facetMappingOptions({
      listSuppliers: async () => [{ id: "makito", code: "makito", display_name: "Makito" }],
      listPublishedProductSources: async () => [],
      listFacetMappings: async () => [{ supplier_id: "makito", facet_type: "color", source_value: "Azul", target_value: "Blue" }],
    })
    expect(options).toContainEqual(expect.objectContaining({ source_value: "Azul", target_value: "Blue", count: 0 }))
  })
})
