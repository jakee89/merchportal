import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { facetReviewRequest, refreshFacetReview, resumeFacetReview, validateAiGroups } from "../facet-ai"

describe("recoverable AI filter reviews", () => {
  const originalFetch = global.fetch
  const originalKey = process.env.OPENAI_API_KEY
  beforeEach(() => { process.env.OPENAI_API_KEY = "test-only-key" })
  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
  })

  function fixture(status = "running", overrides: Record<string, unknown> = {}) {
    let row: any = { id: "review", kind: "ai_review", facet_type: "material", status, data: {
      options: Array.from({ length: 102 }, (_, id) => ({ supplier_id: "s", source_value: `Material ${id}`, supplier_name: "Supplier", count: 1, samples: [] })),
      offset: 100, pending_count: 2, batch_size: 100, response_id: "resp-old", retries: 0,
      groups: [{ target_value: "Cotton", reason: "Same material", option_ids: Array.from({ length: 100 }, (_, id) => id) }],
      usage: { input_tokens: 10, output_tokens: 20 }, ...overrides,
    } }
    const copy = () => JSON.parse(JSON.stringify(row))
    const tx: any = () => {
      const query: any = {
        where: () => query, whereNull: () => query, first: async () => copy(),
        update: async (value: any) => { row = { ...row, ...value, data: JSON.parse(value.data) } },
      }
      return query
    }
    tx.raw = jest.fn()
    const database = { transaction: async (work: any) => work(tx) }
    const service = { listPortalSettings: jest.fn().mockResolvedValue([]), retrieveFacetOperation: async () => copy(), createFacetMappings: jest.fn() }
    return { service, container: { resolve: (key: string) => key === ContainerRegistrationKeys.PG_CONNECTION ? database : service }, row: copy }
  }

  const completed = (target_value = "Recycled cotton") => ({
    id: "resp-old", status: "completed", usage: { input_tokens: 3, output_tokens: 4 },
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ groups: [{ target_value, reason: "Same material", option_ids: [100, 101] }] }) }] }],
  })
  const reply = (body: any) => ({ ok: true, json: async () => body })

  it("constrains names, non-empty groups and IDs to the current smaller batch", () => {
    const data = fixture().row().data
    const body = facetReviewRequest("material", data)
    const schema = body.text.format.schema.properties.groups
    expect(schema.items.properties.target_value).toEqual({ type: "string", minLength: 1, maxLength: 80 })
    expect(schema.items.properties.option_ids).toEqual({ type: "array", minItems: 1, items: { type: "integer", enum: [100, 101] } })
    const values = JSON.parse(body.input).values
    expect(values.map((item: any) => item.id)).toEqual([100, 101])
    expect(body.model).toBe("gpt-6.1-sol")
    expect(body.reasoning.effort).toBe("high")
  })

  it("uses broad shopping families and shared catalogue context rather than specification filters", () => {
    const data = fixture().row().data
    expect(facetReviewRequest("color", data).instructions).toContain("Sky Blue become Blue")
    expect(facetReviewRequest("material", data).instructions).toContain("polyester/rPET variants become Polyester")
    expect(facetReviewRequest("material", data).instructions).toContain("Preserve meaningful blends")
    expect(JSON.parse(facetReviewRequest("material", data).input).catalogue_context).toHaveLength(102)
    const category = facetReviewRequest("category", data)
    expect(category.text.format.schema.properties.groups.items.required).toContain("parent_value")
    expect(category.instructions).toContain("never assign broad Bags to Backpacks")
  })

  it("validates category parents and preserves compatibility with saved flat reviews", () => {
    const group = { target_value: "Backpacks", parent_value: "Bags & Travel", reason: "Useful shopping department", option_ids: [0] }
    expect(validateAiGroups({ groups: [group] }, 0, 1, "category")[0].target_value).toBe("Bags & Travel > Backpacks")
    expect(validateAiGroups({ groups: [{ ...group, parent_value: null }] }, 0, 1, "category")[0].target_value).toBe("Backpacks")
    expect(validateAiGroups({ groups: [{ target_value: "Bags", reason: "Existing review", option_ids: [0] }] }, 0, 1, "category")[0].target_value).toBe("Bags")
    for (const parent_value of ["", "Backpacks", "Bags > Travel", "x".repeat(80), 42]) expect(() => validateAiGroups({ groups: [{ ...group, parent_value }] }, 0, 1, "category")).toThrow()
  })

  it("retries an overlong material label without discarding completed groups or advancing progress", async () => {
    const db = fixture()
    global.fetch = jest.fn().mockResolvedValueOnce(reply(completed("x".repeat(81)))).mockResolvedValueOnce(reply({ id: "resp-retry", status: "queued" }))
    const review = await refreshFacetReview(db.container, "review")
    expect(review.status).toBe("running")
    expect(review.progress).toBe("100/102")
    expect(review.groups).toHaveLength(1)
    expect(db.row().data.retries).toBe(1)
    expect(db.row().data.pending_count).toBe(2)
    expect(db.row().data.response_id).toBe("resp-retry")
    expect(review.usage).toEqual({ input_tokens: 13, output_tokens: 24 })
    expect(db.service.createFacetMappings).not.toHaveBeenCalled()
    global.fetch = jest.fn().mockResolvedValue(reply({ ...completed(), id: "resp-retry" }))
    const finished = await refreshFacetReview(db.container, "review")
    expect(finished.status).toBe("ready")
    expect(finished.progress).toBe("102/102")
    expect(finished.groups).toHaveLength(2)
  })

  it("bounds automatic retries and lets staff resume only unfinished values", async () => {
    const db = fixture()
    global.fetch = jest.fn()
      .mockResolvedValueOnce(reply(completed("x".repeat(81))))
      .mockResolvedValueOnce(reply({ id: "resp-1" }))
      .mockResolvedValueOnce(reply({ ...completed("x".repeat(81)), id: "resp-1" }))
      .mockResolvedValueOnce(reply({ id: "resp-2" }))
      .mockResolvedValueOnce(reply({ ...completed("x".repeat(81)), id: "resp-2" }))
    await refreshFacetReview(db.container, "review")
    await refreshFacetReview(db.container, "review")
    expect((await refreshFacetReview(db.container, "review")).status).toBe("failed")
    expect(global.fetch).toHaveBeenCalledTimes(5)
    global.fetch = jest.fn().mockResolvedValue(reply({ id: "resp-resumed", status: "queued" }))
    const resumed = await resumeFacetReview(db.container, "review")
    expect(resumed.status).toBe("running")
    expect(resumed.progress).toBe("100/102")
    expect(resumed.groups).toHaveLength(1)
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).input).toContain('"id":100')
    expect(resumed.error).toBeUndefined()
    expect(db.service.createFacetMappings).not.toHaveBeenCalled()
  })

  it("handles null groups, missing and duplicate IDs safely", () => {
    expect(() => validateAiGroups({ groups: [null] }, 0, 1)).toThrow("invalid filter group")
    expect(() => validateAiGroups({ groups: [{ target_value: "Cotton", reason: "", option_ids: [0, 0] }] }, 0, 2)).toThrow("duplicate")
    expect(() => validateAiGroups({ groups: [] }, 0, 1)).toThrow("omitted")
  })

  it("continues a previously started 350-value batch without skipping or repeating values", async () => {
    const options = Array.from({ length: 500 }, (_, id) => ({ supplier_id: "s", source_value: `Material ${id}`, supplier_name: "Supplier", count: 1 }))
    const db = fixture("running", { options, pending_count: undefined, batch_size: undefined })
    const response = completed()
    response.output[0].content[0].text = JSON.stringify({ groups: [{ target_value: "Steel", reason: "Same material", option_ids: Array.from({ length: 350 }, (_, index) => index + 100) }] })
    global.fetch = jest.fn().mockResolvedValueOnce(reply(response)).mockResolvedValueOnce(reply({ id: "resp-next" }))
    const review = await refreshFacetReview(db.container, "review")
    expect(review.status).toBe("running")
    expect(review.progress).toBe("450/500")
    expect(db.row().data.pending_count).toBe(50)
    const next = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)
    expect(JSON.parse(next.input).values.map((item: any) => item.id)).toEqual(Array.from({ length: 50 }, (_, index) => index + 450))
  })

  it("does not automatically retry refusals or content-filter interruptions", async () => {
    for (const response of [
      { ...completed(), status: "incomplete", incomplete_details: { reason: "content_filter" } },
      { ...completed(), output: [{ type: "message", content: [{ type: "refusal" }] }] },
    ]) {
      const db = fixture()
      global.fetch = jest.fn().mockResolvedValue(reply(response))
      expect((await refreshFacetReview(db.container, "review")).status).toBe("failed")
      expect(global.fetch).toHaveBeenCalledTimes(1)
    }
  })
})
