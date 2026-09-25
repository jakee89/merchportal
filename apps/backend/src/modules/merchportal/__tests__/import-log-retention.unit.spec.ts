import supplierImportLogRetention from "../../../jobs/supplier-import-log-retention"

describe("supplier import log retention", () => {
  it("clears old logs but keeps job status and counts", async () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const service = {
      listImportJobs: jest.fn().mockResolvedValue([
        { id: "completed", status: "completed", completed_at: old, log: { events: ["old"] } },
        { id: "failed", status: "failed", completed_at: old, log: { events: ["old"] }, error_message: "old error" },
        { id: "recent", status: "completed", completed_at: recent, log: { events: ["recent"] } },
        { id: "running", status: "running", completed_at: old, log: { events: ["active"] } },
      ]),
      updateImportJobs: jest.fn().mockResolvedValue(undefined),
    }
    await supplierImportLogRetention({ resolve: () => service } as any)
    expect(service.updateImportJobs).toHaveBeenCalledWith({ id: "completed", log: null })
    expect(service.updateImportJobs).toHaveBeenCalledWith({ id: "failed", log: null, error_message: null })
    expect(service.updateImportJobs).toHaveBeenCalledTimes(2)
  })
})
