import { catalogSummary, supplierMasterReference } from "../normalization"

describe("supplier catalog normalization", () => {
  it("groups Stricker optional references under their parent product", () => {
    expect(
      supplierMasterReference("stricker", { Reference: "99822-105" }, "99822-105"),
    ).toBe("99822")
  })

  it("keeps a supplier's explicit parent reference", () => {
    expect(
      supplierMasterReference("stricker", { ProductReference: "99822" }, "99822-105"),
    ).toBe("99822")
  })

  it("creates a compact catalog summary without changing product detail text", () => {
    expect(catalogSummary("A long description with enough content to be shortened for the product card.", "Short summary")).toBe("Short summary")
  })
})
