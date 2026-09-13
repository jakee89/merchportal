import { deduplicateSupplierRecords } from "../sync"

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
