import { canonicalSuggestions, categoryBranchGroups, isProtectedTarget, mappingPreview, taxonomyAttention } from "../facet-taxonomy-rules"
import { enforceProtectedAssignments, facetReviewRequest } from "../facet-ai"
import { previewFacetChange } from "../facet-tools"
import type { FacetOption } from "../facet-mappings"

const option = (source_value: string, target_value?: string, facet_type: FacetOption["facet_type"] = "category", supplier_id = "s", count = 5): FacetOption => ({ supplier_id, supplier_name: supplier_id, facet_type, source_value, target_value, count, samples: [] })

describe("taxonomy tools", () => {
  const values = [option("Laptop", "Bags > Backpacks"), option("Rucksack", "Bags > Backpacks", "category", "s2"), option("Tote", "Bags > Totes"), option("Bottle", "Drinkware > Bottles")]
  it("renames entire branches across suppliers and moves or merges only chosen children", () => {
    const branch = categoryBranchGroups(values, "Bags", "Bags & Travel", true)
    expect(branch.map((group) => group.target_value)).toEqual(["Bags & Travel > Backpacks", "Bags & Travel > Totes"])
    expect(branch[0].sources).toHaveLength(2)
    expect(categoryBranchGroups(values, "Bags > Backpacks", "Travel > Backpacks", false)[0].sources).toHaveLength(2)
    const merged = mappingPreview("category", values, categoryBranchGroups(values, "Bags > Totes", "Bags > Backpacks", false))
    expect(merged).toMatchObject({ source_labels: 4, before_filters: 5, after_filters: 4, selected_labels: 1 })
  })
  it("warns about broad groups and suggests existing names without automatically merging semantics", () => {
    expect(canonicalSuggestions("Travel Backpack", ["Backpacks", "Pens"])).toEqual(["Backpacks"])
    expect(canonicalSuggestions("COTTON", ["Cotton"])).toEqual([])
    expect(mappingPreview("category", values, [{ target_value: "Other", sources: values }]).warnings.join(" ")).toContain("too broad")
    const attention = taxonomyAttention([...values, option("Old", "Legacy", "material", "s", 0), option("123"), option("School", "School > Backpacks")])
    expect(attention.map((item) => item.issue).join(" ")).toMatch(/Unused.*Opaque.*different parents/)
  })
  it("protects descendants, leaves other facet types separate, and rejects AI reparenting", () => {
    const protections = [{ facet_type: "category" as const, target_value: "Bags" }]
    expect(isProtectedTarget("category", "Bags > Backpacks", protections)).toBe(true)
    expect(isProtectedTarget("material", "Bags", protections)).toBe(false)
    expect(() => enforceProtectedAssignments([{ target_value: "Travel > Backpacks", option_ids: [0] }], values, protections, "category")).toThrow("protected")
    expect(() => enforceProtectedAssignments([{ target_value: "Bags > Backpacks", option_ids: [0] }], values, protections, "category")).not.toThrow()
    const request = facetReviewRequest("category", { options: values, groups: [], offset: 0, protections })
    expect(JSON.parse(request.input).protected_targets).toEqual(protections)
    expect(request.text.format.schema.properties.groups.items.required).toContain("needs_attention")
  })
  it("previews unique actual products rather than summing source memberships", async () => {
    const service = {
      listSuppliers: async () => [{ id: "s", code: "test", display_name: "Supplier" }, { id: "s2", code: "test", display_name: "Supplier 2" }],
      listPortalSettings: async () => [],
      listFacetMappings: async () => [],
      listPublishedProductSources: async () => [
        { supplier_id: "s", product_id: "p1", catalog_preview: { id: "p1", name: "Bag", materials: ["Cotton", "Canvas"] } },
        { supplier_id: "s2", product_id: "p1", catalog_preview: { id: "p1", name: "Bag", materials: ["Cotton"] } },
      ],
    }
    const preview = await previewFacetChange({ resolve: () => service }, "material", [{ target_value: "Cotton", sources: [option("Cotton", undefined, "material"), option("Canvas", undefined, "material"), option("Cotton", undefined, "material", "s2")] }])
    expect(preview).toMatchObject({ selected_labels: 3, affected_products: 1, after_filters: 1, blocked: [] })
    expect(preview.products).toEqual([{ id: "p1", name: "Bag" }])
  })
})
