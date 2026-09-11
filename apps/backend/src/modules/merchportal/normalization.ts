import { createHash, createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { supplierImageToken } from "./media"

type ObjectValue = Record<string, any>

export type NormalizedVariant = {
  source_id: string
  sku: string
  title: string
  color: string
  size: string
  images: string[]
  price_eur?: number
  stock_quantity?: number
}

export type NormalizedProduct = {
  source_key: string
  supplier_code: string
  supplier_name: string
  title: string
  description?: string
  category?: string
  images: string[]
  variants: NormalizedVariant[]
  published: boolean
}

function value(object: ObjectValue, keys: string[]) {
  const accepted = new Set(keys.map((key) => key.toLowerCase()))
  for (const [key, found] of Object.entries(object || {})) {
    if (
      accepted.has(key.toLowerCase()) &&
      found !== undefined &&
      found !== null &&
      String(found).trim()
    ) return String(found).trim()
  }
}

function numberValue(object: unknown, keys: string[]): number | undefined {
  if (!object || typeof object !== "object") return
  for (const [key, child] of Object.entries(object as ObjectValue)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      const parsed = Number(typeof child === "string" ? child.replace(",", ".") : child)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  for (const child of Object.values(object as ObjectValue)) {
    const found = numberValue(child, keys)
    if (found !== undefined) return found
  }
}

function imageUrls(object: unknown, output = new Set<string>()): string[] {
  if (Array.isArray(object)) {
    object.forEach((item) => imageUrls(item, output))
  } else if (object && typeof object === "object") {
    const entry = object as ObjectValue
    if (entry.type !== "document") {
      for (const key of ["url", "url_highress", "image", "image_url", "picture"]) {
        const candidate = entry[key]
        if (typeof candidate === "string" && /^https:\/\//i.test(candidate)) {
          try {
            const url = new URL(candidate)
            if (
              ["cdn.hideacontent.com", "cdn1.midocean.com"].includes(url.hostname) &&
              (/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.href) ||
                url.pathname.toLowerCase().includes("/image/"))
            ) output.add(candidate)
          } catch {}
        }
      }
    }
    Object.values(entry).forEach((child) => imageUrls(child, output))
  }
  return [...output]
}

function variantRows(payload: ObjectValue) {
  for (const key of ["variants", "optionals", "items", "skus", "colours", "colors"]) {
    if (Array.isArray(payload[key]) && payload[key].length) return payload[key] as ObjectValue[]
  }
  return [payload]
}

function opaqueSourceKey(supplierId: string, externalId: string) {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET || "merchportal"
  return `mp_${createHmac("sha256", secret).update(`${supplierId}:${externalId}`).digest("hex").slice(0, 32)}`
}

function relatedRecords(items: any[], supplierId: string, sku: string, masterId: string) {
  const exact = items.filter((item) => item.supplier_id === supplierId && item.sku === sku)
  if (exact.length) return exact
  return items.filter(
    (item) =>
      item.supplier_id === supplierId &&
      typeof item.sku === "string" &&
      item.sku.startsWith(`${masterId}-`)
  )
}

function proxyImages(urls: string[]) {
  const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  return urls.map(supplierImageToken).filter((token): token is string => Boolean(token)).map((token) => `${backend}/media/${token}`)
}

export async function normalizeSupplierCatalog(
  container: MedusaContainer,
  options: { source_keys?: string[]; take?: number; skip?: number } = {}
): Promise<NormalizedProduct[]> {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [records, prices, stocks, suppliers] = await Promise.all([
    service.listRawSupplierRecords(
      { record_type: "product" },
      { take: 50000, order: { updated_at: "DESC" } }
    ),
    service.listRawSupplierRecords({ record_type: "price" }, { take: 50000 }),
    service.listRawSupplierRecords({ record_type: "stock" }, { take: 50000 }),
    service.listSuppliers({}),
  ])
  const supplierById = new Map<string, any>(suppliers.map((supplier: any) => [supplier.id, supplier]))
  const groups = new Map<string, { supplier_id: string; master_id: string; records: any[] }>()
  for (const record of records) {
    const payload = (record.payload || {}) as ObjectValue
    const supplier = supplierById.get(record.supplier_id)
    const masterId = supplier?.code === "stricker"
      ? value(payload, ["reference", "Reference", "productReference", "product_reference"]) || record.external_id
      : record.external_id
    const groupId = `${record.supplier_id}:${masterId}`
    const group: { supplier_id: string; master_id: string; records: any[] } =
      groups.get(groupId) || {
        supplier_id: record.supplier_id,
        master_id: masterId,
        records: [],
      }
    group.records.push(record)
    groups.set(groupId, group)
  }
  let selectedGroups = [...groups.values()]
  if (options.source_keys?.length) {
    const selected = new Set(options.source_keys)
    selectedGroups = selectedGroups.filter((group) =>
      selected.has(opaqueSourceKey(group.supplier_id, group.master_id))
    )
  } else {
    selectedGroups = selectedGroups.slice(
      options.skip || 0,
      (options.skip || 0) + (options.take || 24)
    )
  }
  const sourceKeys = selectedGroups.map((group) => opaqueSourceKey(group.supplier_id, group.master_id))
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "external_id"],
    filters: { external_id: sourceKeys },
  })
  const published = new Set(existing.map((product: any) => product.external_id))

  return selectedGroups.map((group) => {
    const record = group.records[0]
    const payload = (record.payload || {}) as ObjectValue
    const supplier = supplierById.get(group.supplier_id)
    const rows = group.records.flatMap((item) =>
      variantRows((item.payload || {}) as ObjectValue)
    )
    const seen = new Set<string>()
    const seenSkus = new Set<string>()
    const variants = rows.map((row, index) => {
      const sku = value(row, ["sku", "SKU", "optionalReference", "reference", "variant_id"]) ||
        `${record.external_id}-${index + 1}`
      const color = value(row, ["color_description", "colour_description", "color", "colour", "color_group"]) || "Standard"
      let size = value(row, ["size", "size_description", "format", "dimension"]) || "Standard"
      const combination = `${color}:${size}`
      if (seen.has(combination)) size = sku
      seen.add(`${color}:${size}`)
      const priceMatches = relatedRecords(prices, group.supplier_id, sku, group.master_id)
      const stockMatches = relatedRecords(stocks, group.supplier_id, sku, group.master_id)
      const pricesFound = priceMatches.map((item) => numberValue(item.payload, ["price", "unit_price", "net_price", "price_1"])).filter((item): item is number => item !== undefined)
      const stocksFound = stockMatches.map((item) => numberValue(item.payload, ["stock", "quantity", "available", "free_stock"])).filter((item): item is number => item !== undefined)
      let variantImages = imageUrls(row)
      if (!variantImages.length && supplier?.code === "stricker") {
        const colorCode = value(row, [
          "color_code",
          "colour_code",
          "colorCode",
          "colourCode",
          "color",
        ])
        if (colorCode) {
          variantImages = [
            `https://cdn.hideacontent.com/public/products/1000x1000/${group.master_id}_${colorCode}.jpg`,
          ]
        }
      }
      return {
        source_id: value(row, ["variant_id", "id", "ID"]) || sku,
        sku,
        title: [color, size === "Standard" ? "" : size].filter(Boolean).join(" "),
        color,
        size,
        images: proxyImages(variantImages),
        price_eur: pricesFound.length ? Math.min(...pricesFound) : undefined,
        stock_quantity: stocksFound.length ? stocksFound.reduce((sum, item) => sum + item, 0) : undefined,
      }
    }).filter((variant) => {
      if (seenSkus.has(variant.sku)) return false
      seenSkus.add(variant.sku)
      return true
    })
    const sourceKey = opaqueSourceKey(group.supplier_id, group.master_id)
    const productImages = [
      ...proxyImages(imageUrls(group.records.map((item) => item.payload))),
      ...variants.flatMap((variant) => variant.images),
    ].filter((url, index, all) => all.indexOf(url) === index)
    return {
      source_key: sourceKey,
      supplier_code: supplier?.code || "unknown",
      supplier_name: supplier?.display_name || "Unknown supplier",
      title: value(payload, ["product_name", "name", "Name", "description", "Description"]) || "Merchandise product",
      description: value(payload, ["long_description", "short_description", "description", "Description"]),
      category: value(payload, ["product_class", "category_level3", "category", "category_name"]),
      images: productImages,
      variants,
      published: published.has(sourceKey),
    }
  })
}

export function normalizedProductHandle(product: NormalizedProduct) {
  return `merch-${createHash("sha256").update(product.source_key).digest("hex").slice(0, 16)}`
}
