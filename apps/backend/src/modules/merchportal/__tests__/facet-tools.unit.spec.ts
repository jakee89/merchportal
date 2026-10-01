import { applyFacetChange, facetSourceKey, suggestedFacetGroups, undoFacetChange, validateMappingGroups } from "../facet-tools"
import { validateAiGroups, startFacetReview } from "../facet-ai"
import { protectFacetGroup } from "../facet-protection"

describe("filter cleanup review", () => {
  function database() {
    let rows: Record<string, any[]> = { merchportal_facet_mapping: [], merchportal_facet_operation: [], merchportal_setting: [] }
    const insertSizes: number[] = []
    const knex: any = (table: string) => {
      const filters: Array<(row: any) => boolean> = []
      const matches = (row: any) => filters.every((filter) => filter(row))
      const query: any = {
        where: (values: any) => { filters.push((row) => Object.entries(values).every(([key, value]) => row[key] === value)); return query },
        whereNull: (key: string) => { filters.push((row) => row[key] == null); return query },
        whereRaw: (_sql: string, values: string[]) => { filters.push((row) => row.source_value.trim().toLowerCase() === values[0]); return query },
        first: async () => rows[table].find(matches),
        insert: async (input: any) => {
          const values = Array.isArray(input) ? input : [input]
          if (table === "merchportal_facet_mapping") insertSizes.push(values.length)
          rows[table].push(...values.map((row: any) => ({ ...row, value: typeof row.value === "string" ? JSON.parse(row.value) : row.value, data: typeof row.data === "string" ? JSON.parse(row.data) : row.data })))
        },
        update: async (values: any) => rows[table].filter(matches).forEach((row) => Object.assign(row, values, typeof values.value === "string" ? { value: JSON.parse(values.value) } : {})),
        then: (resolve: any, reject: any) => Promise.resolve(rows[table].filter(matches)).then(resolve, reject),
      }
      return query
    }
    knex.raw = async () => undefined
    knex.transaction = async (callback: any) => {
      const before = structuredClone(rows)
      try { return await callback(knex) } catch (error) { rows = before; throw error }
    }
    const service = { listSuppliers: async () => [{ id: "s" }], listFacetMappings: async ({ facet_type }: any) => rows.merchportal_facet_mapping.filter((row) => !row.deleted_at && row.facet_type === facet_type) }
    return { container: { resolve: (key: string) => key === "merchportal" ? service : knex }, active: () => rows.merchportal_facet_mapping.filter((row) => !row.deleted_at), operations: () => rows.merchportal_facet_operation, insertSizes }
  }

  it("persists protection, blocks edits and undo, allows new members and staff unlock", async () => {
    const db = database()
    const sources = [{ supplier_id: "s", source_value: "Laptop bags" }]
    const id = await applyFacetChange(db.container, "admin", "category", [{ target_value: "Bags > Backpacks", sources }])
    await protectFacetGroup(db.container, "admin", "category", "Bags", true)
    await expect(applyFacetChange(db.container, "admin", "category", [{ target_value: "Travel > Backpacks", sources }])).rejects.toThrow("Unlock")
    await expect(undoFacetChange(db.container, id)).rejects.toThrow("Unlock")
    await applyFacetChange(db.container, "admin", "category", [{ target_value: "Bags > Backpacks", sources: [{ supplier_id: "s", source_value: "Rucksacks" }] }])
    expect(db.active()).toHaveLength(2)
    await protectFacetGroup(db.container, "admin", "category", "Bags", false)
    await undoFacetChange(db.container, id)
    expect(db.active()).toHaveLength(1)
    await expect(protectFacetGroup(db.container, "admin", "material", "Unknown", true)).rejects.toThrow("Approve")
  })

  it("reuses one canonical spelling across groups in a bulk operation", async () => {
    const db = database()
    await applyFacetChange(db.container, "admin", "material", [
      { target_value: "Cotton", sources: [{ supplier_id: "s", source_value: "Cotton woven" }] },
      { target_value: " COTTON ", sources: [{ supplier_id: "s", source_value: "Organic Cotton" }] },
    ])
    expect(db.active().map((row) => row.target_value)).toEqual(["Cotton", "Cotton"])
  })

  it("applies large selections in batches and reverses the entire change", async () => {
    const db = database()
    const sources = Array.from({ length: 501 }, (_, index) => ({ supplier_id: "s", source_value: `Blue-${index}` }))
    const id = await applyFacetChange(db.container, "admin", "color", [{ target_value: "Blue", sources }])
    expect(db.active()).toHaveLength(501)
    expect(db.insertSizes).toEqual([100, 100, 100, 100, 100, 1])
    await undoFacetChange(db.container, id)
    expect(db.active()).toHaveLength(0)
    expect(db.operations()[0].status).toBe("undone")
  })

  it("protects newer edits from undo and rejects stale AI approvals atomically", async () => {
    const db = database()
    const source = { supplier_id: "s", source_value: "Grey" }
    const first = await applyFacetChange(db.container, "admin", "color", [{ target_value: "Grey", sources: [source] }])
    const second = await applyFacetChange(db.container, "admin", "color", [{ target_value: "Dark grey", sources: [source] }])
    await expect(undoFacetChange(db.container, first)).rejects.toThrow("newer changes")
    const another = { supplier_id: "s", source_value: "Silver" }
    const baseline = new Map([[facetSourceKey("color", source), "Grey"], [facetSourceKey("color", another), null]])
    await expect(applyFacetChange(db.container, "admin", "color", [{ target_value: "Silver", sources: [another, source] }], baseline)).rejects.toThrow("changed during")
    expect(db.active()).toHaveLength(1)
    expect(db.active()[0].target_value).toBe("Dark grey")
    await undoFacetChange(db.container, second)
    expect(db.active()[0].target_value).toBe("Grey")
    await undoFacetChange(db.container, first)
    expect(db.active()).toHaveLength(0)
  })
  it("groups equivalent spelling without merging distinct materials", () => {
    const option = (source_value: string, facet_type: "color" | "material" = "color", target_value?: string) => ({ supplier_id: source_value, supplier_name: "Supplier", facet_type, source_value, target_value, count: 3, samples: [] })
    const groups = suggestedFacetGroups([option("Gray"), option("GREY"), option(" Navy "), option("Navy", "color", "Navy"), option("Cotton", "material"), option("Recycled cotton", "material")])
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.target_value === "Grey")?.sources).toHaveLength(2)
    expect(groups.find((group) => group.target_value === "Navy")?.sources).toHaveLength(2)
  })

  it("allows more than 100 values and rejects conflicting assignments", () => {
    const sources = Array.from({ length: 501 }, (_, index) => ({ supplier_id: "supplier", source_value: `value-${index}` }))
    expect(() => validateMappingGroups("color", [{ target_value: "Blue", sources }])).not.toThrow()
    expect(() => validateMappingGroups("color", [{ target_value: "Blue", sources }, { target_value: "Red", sources: [sources[0]] }])).toThrow("two groups")
    expect(() => validateMappingGroups("color", [{ target_value: "", sources }])).toThrow()
  })

  it("requires the AI to account for every source exactly once", () => {
    const group = { target_value: "Blue", reason: "Same colour", option_ids: [350, 351] }
    expect(validateAiGroups({ groups: [group] }, 350, 2)).toEqual([group])
    expect(() => validateAiGroups({ groups: [{ ...group, option_ids: [350] }] }, 350, 2)).toThrow("omitted")
    expect(() => validateAiGroups({ groups: [{ ...group, option_ids: [350, 350] }] }, 350, 2)).toThrow("duplicate")
    expect(() => validateAiGroups({ groups: [{ ...group, option_ids: [349, 351] }] }, 350, 2)).toThrow("unknown")
  })

  it("creates a proposal-only background request using the requested model", async () => {
    const service = {
      listPortalSettings: jest.fn().mockResolvedValue([]),
      listFacetOperations: jest.fn().mockResolvedValue([]),
      listSuppliers: jest.fn().mockResolvedValue([{ id: "s", display_name: "Supplier" }]),
      listPublishedProductSources: jest.fn().mockResolvedValue([{ supplier_id: "s", catalog_preview: { id: "p", name: "Bag", materials: ["RPET"] } }]),
      listFacetMappings: jest.fn().mockResolvedValue([]),
      createFacetOperations: jest.fn().mockImplementation(async (value) => ({ ...value, id: "review" })),
      createFacetMappings: jest.fn(),
    }
    const previousFetch = global.fetch
    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = "test-key"
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "resp_test", status: "queued" }) })
    try {
      const review = await startFacetReview({ resolve: () => service }, "admin", "material")
      expect(review.status).toBe("running")
      const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(request).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "high" }, background: true, text: { format: { type: "json_schema", strict: true } } })
      expect(service.createFacetMappings).not.toHaveBeenCalled()
      expect(JSON.stringify(review)).not.toContain("test-key")
    } finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey }
  })
})
