import { deduplicateSupplierRecords } from "../sync"

describe("supplier sync record deduplication", () => {
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
