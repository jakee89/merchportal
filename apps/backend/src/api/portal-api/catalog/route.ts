import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"
import { supplierImageToken } from "../../../modules/merchportal/media"

function first(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (payload[key] != null && String(payload[key]).trim()) return String(payload[key])
}

function numberValue(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      const parsed = Number(
        typeof child === "string" ? child.replace(",", ".") : child
      )
      if (Number.isFinite(parsed)) return parsed
    }
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") {
      const found = numberValue(child, keys)
      if (found !== undefined) return found
    }
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const membership = await service.listMemberships({ actor_id: req.auth_context?.actor_id, actor_type: "customer", status: "active" }, { take: 1 })
  if (!membership.length) return res.status(403).json({ message: "Join a company before viewing the catalog" })
  const [records, prices, stocks] = await Promise.all([
    service.listRawSupplierRecords({ record_type: "product" }, { take: 48, order: { updated_at: "DESC" } }),
    service.listRawSupplierRecords({ record_type: "price" }, { take: 10000 }),
    service.listRawSupplierRecords({ record_type: "stock" }, { take: 10000 }),
  ])
  const key = (record: any) => `${record.supplier_id}:${record.sku || record.external_id}`
  const priceByProduct = new Map(prices.map((record: any) => [key(record), record.payload]))
  const stockByProduct = new Map(stocks.map((record: any) => [key(record), record.payload]))
  const products = records.map((record: any) => {
    const payload = (record.payload || {}) as Record<string, unknown>
    const token = record.source_image_urls?.[0] ? supplierImageToken(record.source_image_urls[0]) : null
    return {
      id: record.id,
      sku: record.sku || first(payload, ["sku", "SKU", "reference", "ProductReference"]),
      name: first(payload, ["name", "Name", "product_name", "ProductName", "description", "Description"]) || "Merchandise product",
      description: first(payload, ["short_description", "ShortDescription", "description", "Description"]),
      image_url: token ? `/media/${token}` : null,
      price_eur: numberValue(priceByProduct.get(key(record)), ["price", "unit_price", "net_price", "price_1"]),
      stock_quantity: numberValue(stockByProduct.get(key(record)), ["stock", "quantity", "available", "free_stock"]),
    }
  })
  res.json({ products })
}
