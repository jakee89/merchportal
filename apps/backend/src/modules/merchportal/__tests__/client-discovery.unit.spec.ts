import {
  catalogCardData,
  changeShortlist,
  clientShortlists,
  ownedShortlist,
  saveFeaturedCollections,
} from "../client-discovery"

jest.mock("../catalog-prepared", () => ({ preparedCatalog: jest.fn() }))
const product = {
  id: "prod_1",
  name: "Backpack",
  sku: "BAG-01",
  sustainable: false,
  supplier_id: "private",
  cost_by_sku: { "BAG-01": 3 },
  search_text: "private-index",
  filter_variants: [{ sku: "BAG-01" }],
  price_eur: 10,
  color_options: [
    { name: "Blue", sku: "BAG-01", price_eur: 10, private_cost: 3 },
  ],
}

function store() {
  const lists = [
    {
      id: "list-1",
      actor_id: "client-1",
      organization_id: "org-1",
      name: "Christmas gifts",
    },
  ]
  const items: any[] = []
  const matches = (row: any, filter: any) =>
    Object.entries(filter).every(([key, value]) =>
      Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
    )
  return {
    listClientShortlists: jest.fn(async (filter) =>
      lists.filter((list) => matches(list, filter)),
    ),
    listAndCountClientShortlists: jest.fn(async () => [lists, lists.length]),
    createClientShortlists: jest.fn(async (input) => ({
      id: "new-list",
      ...input,
    })),
    updateClientShortlists: jest.fn(),
    deleteClientShortlists: jest.fn(),
    listShortlistItems: jest.fn(async (filter) =>
      items.filter((item) => matches(item, filter)),
    ),
    listAndCountShortlistItems: jest.fn(async () => [items, items.length]),
    createShortlistItems: jest.fn(async (input) => {
      const item = { id: "item-1", ...input }
      items.push(item)
      return item
    }),
    deleteShortlistItems: jest.fn(),
    listPortalSettings: jest.fn(async () => []),
    createPortalSettings: jest.fn(),
    updatePortalSettings: jest.fn(),
  }
}

describe("private shortlists and featured collections", () => {
  it("scopes every list lookup to both the actor and organization", async () => {
    const service = store()
    await expect(
      ownedShortlist(service, "other-client", "org-1", "list-1"),
    ).rejects.toThrow("not found")
    await expect(
      changeShortlist(
        service,
        "client-1",
        "other-org",
        { action: "delete", id: "list-1" },
        [product],
      ),
    ).rejects.toThrow("not found")
    expect(service.deleteClientShortlists).not.toHaveBeenCalled()
    expect(
      await clientShortlists(service, "other-client", "org-1", [product]),
    ).toEqual([])
  })
  it("saves the chosen SKU idempotently and rejects unpublished or invented options", async () => {
    const service = store()
    const input = {
      action: "add",
      id: "list-1",
      product_id: "prod_1",
      sku: "BAG-01",
    }
    await changeShortlist(service, "client-1", "org-1", input, [product])
    await changeShortlist(service, "client-1", "org-1", input, [product])
    expect(service.createShortlistItems).toHaveBeenCalledTimes(1)
    await expect(
      changeShortlist(
        service,
        "client-1",
        "org-1",
        { ...input, sku: "OTHER" },
        [product],
      ),
    ).rejects.toThrow("available")
    await expect(
      changeShortlist(service, "client-1", "org-1", input, []),
    ).rejects.toThrow("available")
  })
  it("removes items only from owned lists and bounds names and list capacity", async () => {
    const service = store()
    await expect(
      changeShortlist(
        service,
        "client-1",
        "org-1",
        { action: "remove", id: "list-1", item_id: "someone-elses-item" },
        [],
      ),
    ).rejects.toThrow("not found")
    await expect(
      changeShortlist(
        service,
        "client-1",
        "org-1",
        { action: "rename", id: "list-1", name: " " },
        [],
      ),
    ).rejects.toThrow("name")
    service.listAndCountClientShortlists.mockResolvedValue([[], 20] as any)
    await expect(
      changeShortlist(
        service,
        "client-1",
        "org-1",
        { action: "create", name: "A" },
        [],
      ),
    ).rejects.toThrow("20")
    expect(service.createClientShortlists).not.toHaveBeenCalled()
  })
  it("projects only customer-safe card fields", () => {
    const card = catalogCardData(product)
    expect(card.price_eur).toBe(10)
    expect(card.color_options[0].sku).toBe("BAG-01")
    expect(JSON.stringify(card)).not.toMatch(
      /private|cost_by_sku|filter_variants|search_text/u,
    )
  })

  it("keeps the saved SKU visible even beyond the card colour cap and marks removed options unavailable", async () => {
    const service = store()
    const multi = {
      ...product,
      filter_variants: [{ sku: "BAG-01", price_eur: 11, stock_quantity: 2 }],
      color_options: [
        ...Array.from({ length: 20 }, (_, i) => ({
          sku: `X-${i}`,
          name: `Colour ${i}`,
        })),
        { name: "Blue", sku: "BAG-01", price_eur: 11 },
      ],
    }
    await changeShortlist(
      service,
      "client-1",
      "org-1",
      { action: "add", id: "list-1", product_id: "prod_1", sku: "BAG-01" },
      [multi],
    )
    const [list] = await clientShortlists(service, "client-1", "org-1", [multi])
    expect(list.items[0].product.color_options[0].sku).toBe("BAG-01")
    expect(list.items[0].product.stock_quantity).toBe(2)
    const [removed] = await clientShortlists(service, "client-1", "org-1", [
      { ...multi, filter_variants: [] },
    ])
    expect(removed.items[0].product).toBeNull()
  })
  it("persists custom featured labels and order without accepting unlisted products", async () => {
    const service = store()
    const input = [
      {
        label: " Christmas gifts ",
        enabled: true,
        product_ids: ["prod_1", "prod_1"],
      },
    ]
    expect(
      await saveFeaturedCollections(service, input, [product], "admin-1"),
    ).toEqual([
      { label: "Christmas gifts", enabled: true, product_ids: ["prod_1"] },
    ])
    expect(service.createPortalSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "featured-collections",
        value: expect.objectContaining({ updated_by: "admin-1" }),
      }),
    )
    await expect(
      saveFeaturedCollections(
        service,
        [{ ...input[0], product_ids: ["unpublished"] }],
        [product],
        "admin-1",
      ),
    ).rejects.toThrow("published")
    await expect(
      saveFeaturedCollections(
        service,
        Array(6).fill(input[0]),
        [product],
        "admin-1",
      ),
    ).rejects.toThrow("five")
  })
})
