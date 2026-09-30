import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { portalReadCache, portalSourceCache } from "./read-cache"
import { listAllFacetMappings } from "./facet-mappings"

export async function catalogRevision(container: any): Promise<{ source: string; settings: string }> {
  return portalReadCache.get("catalog-revision", 1_000, async () => {
    const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    // Include soft-deleted rows: deleting a map or disabling a rule must invalidate reads too.
    const result = await knex.raw(`select
      (select max(updated_at)::text from merchportal_published_product_source) as source,
      concat_ws('|',
        (select max(updated_at)::text from merchportal_pricing_rule),
        (select max(updated_at)::text from merchportal_supplier),
        (select max(updated_at)::text from merchportal_facet_mapping)
      ) as settings`)
    return { source: result.rows[0]?.source || "initial", settings: result.rows[0]?.settings || "initial" }
  })
}

export async function catalogMetadata(service: any, revision: string) {
  return portalReadCache.get(`catalog-metadata:${revision}`, 60_000, async () => {
    const [rules, suppliers, facetMappings] = await Promise.all([
      service.listPricingRules({ status: "active" }),
      service.listSuppliers({}),
      listAllFacetMappings(service),
    ])
    return { rules, suppliers, facetMappings }
  })
}

export async function catalogSources(container: any, revision: string): Promise<any[]> {
  return portalSourceCache.get(`catalog-sources:${revision}`, 10 * 60_000, async () => {
    const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
    return knex("merchportal_published_product_source")
      .select("id", "product_id", "supplier_id", "catalog_preview", "cost_by_sku")
      .whereNull("deleted_at")
  })
}
