import { createHash } from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { supplierImageToken } from "./media"

const recent = new Map<string, { at: number; available: boolean }>()
export const mediaHealthId = (token: string) => `mh_${createHash("sha256").update(token).digest("hex")}`

export async function recordMediaHealth(container: any, token: string, available: boolean) {
  const id = mediaHealthId(token)
  const previous = recent.get(id)
  if (previous?.available === available && Date.now() - previous.at < 300000) return
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const row = { id, available, checked_at: new Date() }
  await knex("merchportal_media_health").insert(row).onConflict("id").merge({ ...row, updated_at: new Date() })
  if (recent.size > 5000) recent.clear()
  recent.set(id, { at: Date.now(), available })
}

export function catalogHealthIssues(source: any, supplier: any, failedMedia: Set<string>, staleHours: number, now = Date.now()) {
  const document = source.catalog_preview || {}
  const variants = document.variants || []
  const issues: string[] = []
  const positivePrice = (price: unknown) => Number.isFinite(Number(price)) && Number(price) > 0
  const hasPrice = (variant: any) => (variant.price_breaks || []).some((price: any) => positivePrice(price.price_eur)) || positivePrice(source.cost_by_sku?.[variant.sku])
  if (!variants.length || variants.some((variant: any) => !hasPrice(variant))) issues.push("missing_prices")
  if (!Number(source.print_option_count)) issues.push("missing_print_options")
  const images = [...new Set([document.image_url, ...variants.flatMap((variant: any) => variant.images || [])].filter((value): value is string => typeof value === "string" && Boolean(value)))]
  if (!images.length) issues.push("missing_images")
  if (images.some((image) => { const token = image.match(/\/media\/([^/?#]+)/u)?.[1] || supplierImageToken(image); return token && failedMedia.has(mediaHealthId(token)) })) issues.push("failed_images")
  if (!supplier?.stock_sync_at || now - new Date(supplier.stock_sync_at).getTime() > staleHours * 3600000) issues.push("stale_stock")
  return issues
}

export async function catalogHealth(container: any, input: { supplier_id?: string; issue?: string; page: number; stale_hours: number }) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const [suppliers, sources, media] = await Promise.all([
    service.listSuppliers({}),
    knex("merchportal_published_product_source").select("product_id", "supplier_id", "catalog_preview", "cost_by_sku").select(knex.raw("case when jsonb_typeof(decoration_options) = 'array' then (select count(*) from jsonb_array_elements(decoration_options) method where case when jsonb_typeof(method->'positions') = 'array' then jsonb_array_length(method->'positions') else 0 end > 0) else 0 end as print_option_count")).whereNull("deleted_at"),
    knex("merchportal_media_health").select("id", "checked_at").where({ available: false }).whereNull("deleted_at"),
  ])
  const bySupplier = new Map<string, any>(suppliers.map((supplier: any) => [supplier.id, supplier]))
  const failures = new Set<string>(media.map((item: any) => item.id))
  const summary: Record<string, number> = { missing_prices: 0, missing_print_options: 0, missing_images: 0, failed_images: 0, stale_stock: 0 }
  const affected: any[] = []
  let productCount = 0
  for (const source of sources) {
    if (input.supplier_id && source.supplier_id !== input.supplier_id) continue
    productCount++
    const supplier = bySupplier.get(source.supplier_id)
    const issues = catalogHealthIssues(source, supplier, failures, input.stale_hours)
    for (const issue of issues) summary[issue]++
    if (issues.length && (!input.issue || issues.includes(input.issue))) affected.push({ id: source.product_id, name: source.catalog_preview?.name || "Product", sku: source.catalog_preview?.variants?.[0]?.sku, supplier: supplier?.display_name || "Supplier", issues, stock_updated_at: supplier?.stock_sync_at })
  }
  const pages = Math.max(1, Math.ceil(affected.length / 50))
  const page = Math.min(input.page, pages)
  return { summary, product_count: productCount, affected_count: affected.length, page, pages, products: affected.slice((page - 1) * 50, page * 50), suppliers: suppliers.map((supplier: any) => ({ id: supplier.id, name: supplier.display_name, stock_updated_at: supplier.stock_sync_at })), generated_at: new Date() }
}
