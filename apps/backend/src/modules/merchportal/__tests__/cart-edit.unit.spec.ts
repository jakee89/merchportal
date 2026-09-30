jest.mock("@medusajs/framework/workflows-sdk", () => ({
  createStep: jest.fn((_name, handler) => handler),
  createWorkflow: jest.fn(() => ({})),
  StepResponse: class { constructor(public result: any) {} },
  WorkflowResponse: class {},
}))

import { createStep } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import "../../../workflows/save-product-configuration"

const handler = (createStep as jest.Mock).mock.calls.find(([name]) => name === "save-configuration")[1]

function context(itemIds = ["original"]) {
  const original = { id: "original", organization_id: "org", product_id: "product", variant_id: "variant", quantity: 25, color: "Black", artwork_files: [{ file_id: "file", filename: "logo.pdf" }] }
  const service = {
    listMemberships: jest.fn().mockResolvedValue([{ organization_id: "org", role: "client_admin" }]),
    listQuoteRequests: jest.fn().mockResolvedValue([{ id: "cart", item_ids: itemIds }]),
    listProductConfigurations: jest.fn().mockResolvedValue([original]),
    listPublishedProductSources: jest.fn().mockResolvedValue([{ supplier_id: "supplier", cost_by_sku: { SKU: 2 }, catalog_document: { variants: [{ sku: "SKU", price_breaks: [{ quantity: 1, price_eur: 2 }, { quantity: 100, price_eur: 1.5 }] }] } }]),
    listSuppliers: jest.fn().mockResolvedValue([{ code: "stricker" }]),
    listPricingRules: jest.fn().mockResolvedValue([{ markup_percentage: 20 }]),
    createProductConfigurations: jest.fn().mockImplementation(async (data) => ({ id: "duplicate", ...data })),
    updateProductConfigurations: jest.fn().mockImplementation(async (data) => data),
    updateQuoteRequests: jest.fn().mockResolvedValue({ id: "cart" }),
  }
  const query = { graph: jest.fn().mockResolvedValue({ data: [{ variants: [{ id: "variant", sku: "SKU" }] }] }) }
  return { service, container: { resolve: (name: string) => name === ContainerRegistrationKeys.QUERY ? query : service } }
}

const input = { actor_id: "customer", product_id: "product", variant_id: "variant", quantity: 100, color: "Black", decorations: [] }

describe("cart editing and duplication", () => {
  it("edits a full cart in place, retains artwork and recalculates quantity pricing", async () => {
    const { container, service } = context(["original", ...Array.from({ length: 49 }, (_, index) => String(index))])
    const response = await handler({ ...input, configuration_id: "original" }, { container })
    expect(response.result).toMatchObject({ id: "original", estimated_total: 180 })
    expect(service.updateProductConfigurations).toHaveBeenCalledWith(expect.objectContaining({ id: "original", quantity: 100, artwork_files: [{ file_id: "file", filename: "logo.pdf" }] }))
    expect(service.createProductConfigurations).not.toHaveBeenCalled()
    expect(service.updateQuoteRequests).not.toHaveBeenCalled()
  })
  it("duplicates with existing artwork and adds a separate item", async () => {
    const { container, service } = context()
    await handler({ ...input, duplicate_configuration_id: "original" }, { container })
    expect(service.createProductConfigurations).toHaveBeenCalledWith(expect.objectContaining({ quantity: 100, artwork_files: [{ file_id: "file", filename: "logo.pdf" }] }))
    expect(service.updateQuoteRequests).toHaveBeenCalledWith({ id: "cart", item_ids: ["original", "duplicate"] })
  })
  it("rejects another company's item and duplicate attempts beyond the cart limit", async () => {
    await expect(handler({ ...input, configuration_id: "foreign" }, { container: context().container })).rejects.toThrow("Editable cart item")
    await expect(handler({ ...input, duplicate_configuration_id: "original" }, { container: context(["original", ...Array.from({ length: 49 }, (_, index) => String(index))]).container })).rejects.toThrow("50 configured")
  })
})
