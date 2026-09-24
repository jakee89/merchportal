import { deduplicateSupplierRecords, ImportCancelledError, interruptibleSupplierRead, reconcileStaleImportJobs } from "../sync"

describe("supplier sync record deduplication", () => {
  it("keeps every Stricker OptionalReference when the feed uses PascalCase fields", () => {
    const records = deduplicateSupplierRecords(
      [
        { ProductReference: "99822", OptionalReference: "99822-103" },
        { ProductReference: "99822", OptionalReference: "99822-105" },
      ],
      "stricker",
      "product",
    )

    expect(records).toHaveLength(2)
  })

  it("keeps distinct Stricker decorations for the same product", () => {
    const records = deduplicateSupplierRecords(
      [
        { master_code: "PDP1-01", service_code: "LAS" },
        { master_code: "PDP1-01", service_code: "SCR" },
      ],
      "stricker",
      "decoration",
    )

    expect(records).toHaveLength(2)
  })

  it("keeps Midocean print guides for each colour SKU", () => {
    const records = deduplicateSupplierRecords([
      { product_code: "MO2639", sku: "MO2639-03", printing_positions: [{ images: [{ variant_color: "03" }] }] },
      { product_code: "MO2639", sku: "MO2639-39", printing_positions: [{ images: [{ variant_color: "39" }] }] },
    ], "midocean", "decoration")
    expect(records).toHaveLength(2)
  })

  it("keeps Midocean prices and stock for each colour SKU", () => {
    const records = [
      { model: "MO2639", sku: "MO2639-03", price: 1.25 },
      { model: "MO2639", sku: "MO2639-39", price: 1.35 },
    ]
    expect(deduplicateSupplierRecords(records, "midocean", "price")).toHaveLength(2)
    expect(deduplicateSupplierRecords(records, "midocean", "stock")).toHaveLength(2)
  })

  it("does not collapse documented Stricker CustomizationOptions rows", () => {
    const records = deduplicateSupplierRecords(
      [
        { ProdReference: "99164", Component: "Ball pen", Location: "Barrel", TableCode: "PDP1-01", TableCodeOption: "PDP1-01-01" },
        { ProdReference: "99164", Component: "Ball pen", Location: "Barrel 2", TableCode: "PDP1-01", TableCodeOption: "PDP1-01-01" },
        { ProdReference: "99164", Component: "Ball pen", Location: "Barrel", TableCode: "PDP1-01", TableCodeOption: "PDP1-01-02" },
      ],
      "stricker",
      "decoration",
    )

    expect(records).toHaveLength(3)
  })

  it("keeps the most recent copy of a duplicate Stricker decoration", () => {
    const records = deduplicateSupplierRecords(
      [
        { master_code: "PDP1-01", service_code: "LAS", price: 1 },
        { master_code: "PDP1-01", service_code: "LAS", price: 2 },
      ],
      "stricker",
      "decoration",
    )

    expect(records).toEqual([
      { master_code: "PDP1-01", service_code: "LAS", price: 2 },
    ])
  })

  it("normalizes whitespace in a supplier record identity", () => {
    const records = deduplicateSupplierRecords(
      [{ id: "PDP1-01" }, { id: "PDP1-01 " }],
      "stricker",
      "decoration",
    )

    expect(records).toEqual([{ id: "PDP1-01 " }])
  })
})

describe("supplier update interruption", () => {
  it("times out a read that never returns with a useful stage name", async () => {
    await expect(interruptibleSupplierRead(() => new Promise(() => undefined), "Loading published products", undefined, { timeoutMs: 20 })).rejects.toThrow("Loading published products timed out")
  })

  it("stops a pending read when staff requests cancellation", async () => {
    let checks = 0
    const checkCancelled = async () => { if (++checks > 1) throw new ImportCancelledError() }
    await expect(interruptibleSupplierRead(() => new Promise(() => undefined), "Loading published products", checkCancelled, { timeoutMs: 1000, pollMs: 10 })).rejects.toBeInstanceOf(ImportCancelledError)
  })

  it("closes unresponsive running and cancelling jobs", async () => {
    const updatedAt = new Date(Date.now() - 6 * 60_000)
    const jobs = [
      { id: "running", status: "running", phase: "refreshing", updated_at: updatedAt, log: {} },
      { id: "cancelling", status: "cancelling", phase: "cancelling", updated_at: updatedAt, log: {} },
    ]
    const service = {
      listImportJobs: jest.fn().mockResolvedValue(jobs),
      retrieveImportJob: jest.fn().mockImplementation(async (id) => jobs.find((job) => job.id === id)),
      updateImportJobs: jest.fn().mockResolvedValue(undefined),
    }
    await reconcileStaleImportJobs(service)
    expect(service.updateImportJobs).toHaveBeenCalledWith(expect.objectContaining({ id: "running", status: "failed", phase: "failed" }))
    expect(service.updateImportJobs).toHaveBeenCalledWith(expect.objectContaining({ id: "cancelling", status: "cancelled", phase: "cancelled" }))
  })
})
