import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function relatedProductSources(container: any, supplierId: string, productId: string, category?: string) {
  if (!category) return []
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  return knex("merchportal_published_product_source")
    .select("product_id", "catalog_preview", "cost_by_sku")
    .where({ supplier_id: supplierId })
    .whereRaw("catalog_preview->>'category' = ?", [category])
    .whereNull("deleted_at")
    .whereNot("product_id", productId)
    .orderBy("updated_at", "desc")
    .limit(6)
}
