jest.mock("../catalog-data", () => ({ ...jest.requireActual("../catalog-data"), catalogRevision: jest.fn(), catalogSources: jest.fn() }))
jest.mock("../related-products", () => ({ relatedProductSources: jest.fn() }))

import { GET as catalogGet } from "../../../api/portal-api/catalog/route"
import { GET as productGet } from "../../../api/portal-api/products/[id]/route"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { catalogRevision, catalogSources } from "../catalog-data"
import { clearPortalCatalogCache } from "../catalog-cache"
import { relatedProductSources } from "../related-products"
import { preparedCatalog, warmActiveCatalogs, warmDefaultCatalog } from "../catalog-prepared"

const makeSource = (id: string, supplier: string, sku: string, cost: number) => ({
  id: `source-${id}`, product_id: id, supplier_id: supplier, cost_by_sku: { [sku]: cost },
  catalog_preview: { id, name: id, description: "Test product", category: "Bags", category_hierarchy: ["Bags"], variants: [{ sku, color: "Black", size: "S", stock_quantity: 5, price_breaks: [{ quantity: 1, price_eur: cost }] }] },
  catalog_document: { category: "Bags", variants: [{ sku, color: "Black", price_breaks: [{ quantity: 1, price_eur: cost }] }] },
  decoration_options: [{ id: "SCREEN", name: "Screen", price_breaks: [{ quantity: 1, unit_price_eur: 1 }], positions: [] }],
})

describe("read-only performance paths", () => {
  let service: any
  let scope: any
  let query: any
  const sources = [makeSource("p-midocean", "midocean", "MO6783-03", 10), makeSource("p-stricker", "stricker", "92147-131", 20)]

  beforeEach(() => {
    clearPortalCatalogCache()
    jest.clearAllMocks()
    jest.mocked(catalogRevision).mockResolvedValue({ source: "s1", settings: "r1" })
    jest.mocked(catalogSources).mockResolvedValue(sources)
    jest.mocked(relatedProductSources).mockResolvedValue([sources[1]])
    service = {
      listMemberships: jest.fn(async ({ actor_id }) => actor_id === "revoked" ? [] : [{ organization_id: actor_id }]),
      listPricingRules: jest.fn().mockResolvedValue([{ scope_key: "global", markup_percentage: 30 }, { scope_key: "organization:company-b", markup_percentage: 50 }]),
      listSuppliers: jest.fn().mockResolvedValue([{ id: "midocean", code: "midocean", catalog_priority: 2 }, { id: "stricker", code: "stricker", catalog_priority: 1 }]),
      listFacetMappings: jest.fn().mockResolvedValue([]),
      listPublishedProductSources: jest.fn().mockResolvedValue([sources[0]]),
    }
    query = { graph: jest.fn().mockResolvedValue({ data: [{ id: "p-midocean", title: "Product", sales_channels: [{ name: "MerchPortal Malta" }], variants: [{ id: "variant", sku: "MO6783-03", prices: [] }] }] }) }
    scope = { resolve: (key: string) => key === ContainerRegistrationKeys.QUERY ? query : service }
  })

  const request = (actor = "company-a", query = {}) => ({ scope, auth_context: { actor_id: actor }, query, params: { id: "p-midocean" } })
  const response = () => { const res = { json: jest.fn(), setHeader: jest.fn(), status: jest.fn() }; res.status.mockReturnValue(res); return res }

  it("excludes stored Makito marking branches even with saved mappings, preserving print filters and products", async () => {
    const mixed = makeSource("makito-mixed", "makito", "6009", 10)
    const markingOnly = makeSource("makito-marking-only", "makito", "6010", 10)
    mixed.catalog_preview = { ...mixed.catalog_preview, category_hierarchy: ["Marking Techniques", "Digital", "Bags"], category_paths: [["Marking Techniques", "Digital"], ["Bags", "Backpacks"]], print_methods: ["Digital"] } as any
    markingOnly.catalog_preview = { ...markingOnly.catalog_preview, category: "Digital", category_hierarchy: ["Marking Techniques", "Digital"], category_paths: [["Marking Techniques", "Digital"]], print_methods: ["Digital"] } as any
    jest.mocked(catalogSources).mockResolvedValue([mixed, markingOnly])
    service.listSuppliers.mockResolvedValue([{ id: "makito", code: "makito" }])
    service.listFacetMappings.mockResolvedValue([{ supplier_id: "makito", facet_type: "category", source_value: "Digital", target_value: "Marking Techniques > Digital" }])
    const result = response()
    await catalogGet(request("company-a") as any, result as any)
    const body = result.json.mock.calls[0][0]
    expect(body.total).toBe(2)
    expect(body.facets.category_tree.roots).toEqual([{ value: "Bags", count: 1, children: [{ value: "Bags > Backpacks", label: "Backpacks", count: 1 }] }])
    expect(body.facets.categories.map((item: any) => item.value)).toEqual(["Backpacks", "Bags"])
    expect(body.facets.print_methods).toEqual([{ value: "Digital", count: 2 }])
  })

  it("shares catalog loads while preserving supplier ordering, prices and membership checks", async () => {
    const first = response()
    const second = response()
    await Promise.all([catalogGet(request() as any, first as any), catalogGet(request() as any, second as any)])
    expect(catalogSources).toHaveBeenCalledTimes(1)
    expect(service.listPricingRules).toHaveBeenCalledTimes(1)
    expect(first.json.mock.calls[0][0].products.map((item: any) => item.id)).toEqual(["p-stricker", "p-midocean"])
    expect(first.json.mock.calls[0][0].products[1].price_eur).toBe(13)
    expect(JSON.stringify(first.json.mock.calls[0][0])).not.toMatch(/cost_by_sku|supplier_id|search_text|filter_variants/)
    const companyB = response()
    await catalogGet(request("company-b") as any, companyB as any)
    expect(companyB.json.mock.calls[0][0].products[1].price_eur).toBe(15)
    const revoked = response()
    await catalogGet(request("revoked") as any, revoked as any)
    expect(revoked.status).toHaveBeenCalledWith(403)
    expect(service.listMemberships).toHaveBeenCalledTimes(4)
  })

  it("shares prepared default pricing for new companies but isolates company overrides", async () => {
    const revision = { source: "s1", settings: "r1" }
    const first = await preparedCatalog(scope, service, "company-a", revision)
    const newlyRegistered = await preparedCatalog(scope, service, "new-company", revision)
    expect(newlyRegistered).toBe(first)
    const overridden = await preparedCatalog(scope, service, "company-b", revision)
    expect(overridden).not.toBe(first)
    expect(overridden.find((row) => row.id === "p-midocean").price_eur).toBe(15)
  })

  it("warms default prices using the module's existing connection before any client visit", async () => {
    const rows: Record<string, any[]> = {
      merchportal_pricing_rule: [{ scope_key: "global", markup_percentage: "30", status: "active" }],
      merchportal_supplier: [{ id: "midocean", code: "midocean", catalog_priority: 2 }, { id: "stricker", code: "stricker", catalog_priority: 1 }],
      merchportal_facet_mapping: [],
    }
    const knex = (table: string) => {
      const builder: any = {}
      for (const method of ["whereNull", "where", "select", "orderBy", "limit", "offset"]) builder[method] = () => builder
      builder.then = (resolve: any, reject: any) => Promise.resolve(rows[table]).then(resolve, reject)
      return builder
    }
    await warmDefaultCatalog({ resolve: () => knex }, { source: "s1", settings: "r1" })
    const warmReads = jest.mocked(catalogSources).mock.calls.length
    const first = response()
    await catalogGet(request("new-company") as any, first as any)
    expect(catalogSources).toHaveBeenCalledTimes(warmReads)
    expect(service.listPricingRules).not.toHaveBeenCalled()
    expect(first.json.mock.calls[0][0].products[1].price_eur).toBe(13)
  })

  it("does not restore marking categories from native-product fallback records", async () => {
    jest.mocked(catalogSources).mockResolvedValue([{ ...sources[0], catalog_preview: undefined }])
    service.listSuppliers.mockResolvedValue([{ id: "makito", code: "makito" }])
    service.listPublishedProductSources.mockResolvedValue([{ ...sources[0], supplier_id: "makito", print_methods: ["Digital"], catalog_document: { category: "Digital", category_paths: [["Marking Techniques", "Digital"]], category_hierarchy: ["Marking Techniques", "Digital"] } }])
    query.graph.mockResolvedValue({ data: [{ id: "p-midocean", external_id: "mp_makito", title: "Bag", categories: [{ name: "Digital" }], sales_channels: [{ name: "MerchPortal Malta" }], variants: [] }] })
    const result = response()
    await catalogGet(request("company-a") as any, result as any)
    expect(result.json.mock.calls[0][0].facets.category_tree.roots).toEqual([])
    expect(result.json.mock.calls[0][0].facets.print_methods).toEqual([{ value: "Digital", count: 1 }])
    expect(result.json.mock.calls[0][0].total).toBe(1)
  })

  it("invalidates catalog results on source and settings changes and keeps exact-code searches strict", async () => {
    const first = response()
    await catalogGet(request("company-a", { q: "92147" }) as any, first as any)
    expect(first.json.mock.calls[0][0].products.map((item: any) => item.id)).toEqual(["p-stricker"])
    const noMatches = response()
    await catalogGet(request("company-a", { q: "92149" }) as any, noMatches as any)
    expect(noMatches.json.mock.calls[0][0].total).toBe(0)
    jest.mocked(catalogRevision).mockResolvedValue({ source: "s2", settings: "r2" })
    jest.mocked(catalogSources).mockResolvedValue([makeSource("p-stricker", "stricker", "92147-131", 30)])
    service.listPricingRules.mockResolvedValue([{ scope_key: "global", markup_percentage: 20 }])
    const changed = response()
    await catalogGet(request("company-a", { q: "92147" }) as any, changed as any)
    expect(changed.json.mock.calls[0][0].products[0].price_eur).toBe(36)
    expect(service.listPricingRules).toHaveBeenCalledTimes(2)
  })

  it("returns identical cards and filter counts through the split compact endpoints", async () => {
    const combined = response()
    const products = response()
    const facets = response()
    await catalogGet(request("company-a", { color: "Black" }) as any, combined as any)
    await catalogGet(request("company-a", { color: "Black", view: "products", compact: "true" }) as any, products as any)
    await catalogGet(request("company-a", { color: "Black", view: "facets", compact: "true" }) as any, facets as any)
    const full = combined.json.mock.calls[0][0]
    const cards = products.json.mock.calls[0][0]
    expect(cards.facets).toBeUndefined()
    expect(cards.total).toBe(full.total)
    expect(cards.products.map((item: any) => [item.id, item.price_eur, item.price_from_quantity, item.color_options, item.stock_quantity, item.description])).toEqual(full.products.map((item: any) => [item.id, item.price_eur, item.price_from_quantity, item.color_options, item.stock_quantity, item.description]))
    expect(cards.products[0].keywords).toBeUndefined()
    const compact = facets.json.mock.calls[0][0].facets
    expect(compact.categories.map(([value, count]: [string, number]) => ({ value, count }))).toEqual(full.facets.categories)
    expect(compact.colors.map(([value, count]: [string, number]) => ({ value, count }))).toEqual(full.facets.colors)
    expect(compact.availability).toEqual(full.facets.availability)
    expect(JSON.stringify(cards).length).toBeLessThan(JSON.stringify(full).length)
  })

  it("warms changed company prices without serving a different company's markup", async () => {
    await catalogGet(request("company-a") as any, response() as any)
    jest.mocked(catalogRevision).mockResolvedValue({ source: "s1", settings: "r2" })
    service.listPricingRules.mockResolvedValue([{ scope_key: "organization:company-a", markup_percentage: 40 }, { scope_key: "organization:company-b", markup_percentage: 50 }])
    await warmActiveCatalogs()
    const a = response()
    const b = response()
    await catalogGet(request("company-a", { view: "products" }) as any, a as any)
    await catalogGet(request("company-b", { view: "products" }) as any, b as any)
    expect(a.json.mock.calls[0][0].products[1].price_eur).toBe(14)
    expect(b.json.mock.calls[0][0].products[1].price_eur).toBe(15)
    const revoked = response()
    await catalogGet(request("revoked", { view: "facets" }) as any, revoked as any)
    expect(revoked.status).toHaveBeenCalledWith(403)
  })

  it("keeps detail pricing company-specific even when sharing raw product and decoration reads", async () => {
    const first = response()
    await productGet(request("company-a", { include_related: "false" }) as any, first as any)
    const second = response()
    await productGet(request("company-b", { include_related: "false" }) as any, second as any)
    expect(query.graph).toHaveBeenCalledTimes(1)
    expect(service.listPublishedProductSources).toHaveBeenCalledTimes(1)
    expect(first.json.mock.calls[0][0].product.variants[0].price_eur).toBe(13)
    expect(second.json.mock.calls[0][0].product.variants[0].price_eur).toBe(15)
    expect(first.json.mock.calls[0][0].product.decoration_options[0].price_breaks[0].unit_price_eur).toBe(1.3)
    expect(second.json.mock.calls[0][0].product.decoration_options[0].price_breaks[0].unit_price_eur).toBe(1.5)
    expect(relatedProductSources).not.toHaveBeenCalled()
    const related = response()
    await productGet(request("company-b", { related_only: "true" }) as any, related as any)
    expect(related.json.mock.calls[0][0]).toEqual({ related: [{ id: "p-stricker", name: "p-stricker", price_eur: 30, price_from_quantity: 1, has_price_tiers: false, image_url: undefined }] })
  })

  it("still refuses unauthenticated or revoked users with a warm product cache", async () => {
    await productGet(request() as any, response() as any)
    await expect(productGet(request("revoked") as any, response() as any)).rejects.toThrow("Active company membership")
    await expect(productGet({ ...request(), auth_context: {} } as any, response() as any)).rejects.toThrow("Active company membership")
    expect(query.graph).toHaveBeenCalledTimes(1)
  })
})
