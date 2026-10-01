import {
  GET as clientGet,
  POST as clientPost,
} from "../../../api/portal-api/discovery/route"
import {
  GET as featuredGet,
  POST as featuredPost,
} from "../../../api/admin/merchportal/featured/route"
import { GET as historyGet } from "../../../api/admin/merchportal/email-deliveries/route"
import { customerQuoteContext } from "../../../api/portal-api/quotes/auth"
import { requireStaff } from "../../../api/admin/merchportal/auth"
import { discoveryCatalog } from "../client-discovery"

jest.mock("../../../api/portal-api/quotes/auth", () => ({
  customerQuoteContext: jest.fn(),
}))
jest.mock("../../../api/admin/merchportal/auth", () => ({
  requireStaff: jest.fn(),
}))
jest.mock("../client-discovery", () => ({
  ...jest.requireActual("../client-discovery"),
  discoveryCatalog: jest.fn(),
}))

const product = {
  id: "prod_1",
  sku: "BAG-01",
  name: "Backpack",
  filter_variants: [{ sku: "BAG-01" }],
  price_eur: 12,
  supplier_id: "private",
  cost_by_sku: { "BAG-01": 3 },
  color_options: [],
}
const response = () => ({ json: jest.fn(), setHeader: jest.fn() })

describe("discovery and delivery route permissions", () => {
  let service: any
  let req: any
  beforeEach(() => {
    jest.clearAllMocks()
    service = {
      listPortalSettings: jest.fn(async () => [
        {
          value: {
            collections: [
              {
                label: "Christmas gifts",
                enabled: true,
                product_ids: ["prod_1", "removed"],
              },
              { label: "Hidden", enabled: false, product_ids: ["prod_1"] },
            ],
          },
        },
      ]),
      listClientShortlists: jest.fn(async () => []),
      listAndCountEmailDeliveries: jest.fn(async () => [[], 0]),
    }
    req = {
      query: {},
      body: {},
      auth_context: { actor_id: "client-1" },
      scope: { resolve: jest.fn(() => service) },
    }
    jest
      .mocked(customerQuoteContext)
      .mockResolvedValue({
        service,
        membership: { organization_id: "org-1" },
        actorId: "client-1",
      } as any)
    jest
      .mocked(discoveryCatalog)
      .mockResolvedValue({ products: [product], revision: "r1" })
    jest.mocked(requireStaff).mockResolvedValue({ role: "super_admin" } as any)
  })
  it("requires active client membership on every read and write", async () => {
    jest
      .mocked(customerQuoteContext)
      .mockRejectedValue(new Error("Active company membership required"))
    await expect(clientGet(req, response() as any)).rejects.toThrow(
      "membership",
    )
    await expect(clientPost(req, response() as any)).rejects.toThrow(
      "membership",
    )
    expect(discoveryCatalog).not.toHaveBeenCalled()
  })
  it("shows only enabled published featured products using this organization's catalog", async () => {
    req.query.kind = "featured"
    const res = response()
    await clientGet(req, res as any)
    expect(discoveryCatalog).toHaveBeenCalledWith(req.scope, service, "org-1")
    const collections = res.json.mock.calls[0][0].collections
    expect(collections).toHaveLength(1)
    expect(collections[0].label).toBe("Christmas gifts")
    expect(collections[0].products.map((product: any) => product.id)).toEqual([
      "prod_1",
    ])
    expect(JSON.stringify(collections)).not.toMatch(
      /cost_by_sku|supplier_id|private/u,
    )
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    )
  })
  it("denies featured mutations to non-admin staff, and keeps email history staff-only", async () => {
    jest.mocked(requireStaff).mockResolvedValue({ role: "sales_rep" } as any)
    await expect(featuredPost(req, response() as any)).rejects.toThrow(
      "administrators",
    )
    expect(discoveryCatalog).not.toHaveBeenCalled()
    jest.mocked(requireStaff).mockRejectedValue(new Error("Sign in required"))
    await expect(featuredGet(req, response() as any)).rejects.toThrow("Sign in")
    await expect(historyGet(req, response() as any)).rejects.toThrow("Sign in")
    expect(service.listAndCountEmailDeliveries).not.toHaveBeenCalled()
  })
})
