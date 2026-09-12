import { createHash, createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { fieldValue, productAttributes, supplierCategory } from "./catalog-rules"
import { normalizeDecorationOptions, type DecorationMethod } from "./decoration"

type ObjectValue = Record<string, any>

export type NormalizedVariant = {
  source_id: string
  sku: string
  title: string
  color: string
  color_code?: string
  color_group?: string
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
  short_description?: string
  category?: string
  supplier_category: string
  category_mapping_id?: string
  category_status: "pending" | "approved" | "ignored" | "unmapped"
  lead_time?: string
  sustainable: boolean
  print_methods: string[]
  decoration_options: DecorationMethod[]
  attributes: {
    materials: string[]
    brand?: string
    country_of_origin?: string
    dimensions?: string
    weight?: string
    keywords: string[]
  }
  images: string[]
  variants: NormalizedVariant[]
  published: boolean
}

function value(object: ObjectValue, keys: string[]) {
  const accepted = new Set(keys.map((key) => key.toLowerCase()))
  for (const [key, found] of Object.entries(object || {})) {
    if (accepted.has(key.toLowerCase()) && found !== undefined && found !== null && String(found).trim()) return String(found).trim()
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
            if (["cdn.hideacontent.com", "cdn1.midocean.com"].includes(url.hostname) && (/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.href) || url.pathname.toLowerCase().includes("/image/"))) output.add(candidate)
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

export function supplierMasterReference(supplierCode: string | undefined, payload: ObjectValue, fallback: string) {
  const explicit = value(payload, ["product_reference", "productReference", "master_id", "master_code", "parent_reference", "main_reference"])
  const reference = explicit || value(payload, ["reference", "Reference", "sku", "optionalReference"]) || fallback
  if (supplierCode === "stricker") {
    return reference.replace(/^(\d{4,})-\d{3,}$/u, "$1")
  }
  return reference
}

export function catalogSummary(fullDescription?: string, suppliedSummary?: string) {
  const source = (suppliedSummary || fullDescription || "").replace(/\s+/g, " ").trim()
  if (source.length <= 180) return source || undefined
  const sentence = source.slice(0, 181).match(/^(.{1,180})(?:\s|$)/u)?.[1]?.trim()
  return `${sentence || source.slice(0, 180).trim()}…`
}

function relatedRecords(items: any[], supplierId: string, sku: string, masterId: string) {
  const keys = [sku]
  const exact = items.filter((item) => {
    if (item.supplier_id !== supplierId) return false
    const references = [
      item.sku,
      fieldValue(item.payload, ["sku", "optional_reference", "optionalReference", "reference", "product_reference", "productReference"]),
    ].filter((value): value is string => Boolean(value))
    return references.some((reference) => keys.includes(reference))
  })
  if (exact.length) return exact
  return items.filter((item) => {
    if (item.supplier_id !== supplierId) return false
    const reference = item.sku || fieldValue(item.payload, ["reference", "product_reference", "productReference"])
    return typeof reference === "string" && (reference === masterId || reference.startsWith(`${masterId}-`))
  })
}

function proxyImages(urls: string[]) {
  return urls
}

async function listAllRawSupplierRecords(service: any, filters: Record<string, unknown>, order?: Record<string, "ASC" | "DESC">) {
  const records: any[] = []
  const take = 5000
  for (let skip = 0; ; skip += take) {
    const batch = await service.listRawSupplierRecords(filters, { take, skip, order })
    records.push(...batch)
    if (batch.length < take) return records
  }
}

export async function normalizeSupplierCatalog(container: MedusaContainer, options: { source_keys?: string[]; take?: number; skip?: number } = {}): Promise<NormalizedProduct[]> {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [allRecords, allPrices, allStocks, allDecorations, allDecorationPrices, suppliers] = await Promise.all([
    listAllRawSupplierRecords(service, { record_type: "product" }, { updated_at: "DESC" }),
    listAllRawSupplierRecords(service, { record_type: "price" }),
    listAllRawSupplierRecords(service, { record_type: "stock" }),
    listAllRawSupplierRecords(service, { record_type: "decoration" }),
    listAllRawSupplierRecords(service, { record_type: "decoration_price" }),
    service.listSuppliers({}),
  ])
  const supplierById = new Map<string, any>(suppliers.map((supplier: any) => [supplier.id, supplier]))
  const currentRecords = (items: any[], syncField: string) =>
    items.filter((item) => {
      const syncedAt = supplierById.get(item.supplier_id)?.[syncField]
      return !syncedAt || new Date(item.last_seen_at).getTime() >= new Date(syncedAt).getTime() - 15 * 60_000
    })
  const records = currentRecords(allRecords, "product_sync_at")
  const prices = currentRecords(allPrices, "price_sync_at")
  const stocks = currentRecords(allStocks, "stock_sync_at")
  const decorations = currentRecords(allDecorations, "product_sync_at")
  const decorationPrices = currentRecords(allDecorationPrices, "product_sync_at")
  const groups = new Map<string, { supplier_id: string; master_id: string; records: any[] }>()
  for (const record of records) {
    const payload = (record.payload || {}) as ObjectValue
    const supplier = supplierById.get(record.supplier_id)
    const masterId = supplierMasterReference(supplier?.code, payload, record.external_id)
    const groupId = `${record.supplier_id}:${masterId}`
    const group: { supplier_id: string; master_id: string; records: any[] } = groups.get(groupId) || {
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
    selectedGroups = selectedGroups.filter((group) => selected.has(opaqueSourceKey(group.supplier_id, group.master_id)))
  } else {
    const skip = options.skip || 0
    selectedGroups = selectedGroups.slice(skip, skip + (options.take ?? 24))
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
    const originalCategory = supplierCategory(payload)
    const attributes = productAttributes(group.records.map((item) => item.payload))
    const decorationPayloads = decorations
      .filter((item: any) => {
        if (item.supplier_id !== group.supplier_id) return false
        if (item.external_id === group.master_id || item.external_id.startsWith(`${group.master_id}:`)) return true
        const reference = supplierMasterReference(supplier?.code, (item.payload || {}) as ObjectValue, item.external_id)
        return reference === group.master_id
      })
      .map((item: any) => item.payload)
    const supplierDecorationPrices = decorationPrices.filter((item: any) => item.supplier_id === group.supplier_id).map((item: any) => item.payload)
    const decorationOptions = normalizeDecorationOptions([...group.records.map((item) => item.payload), ...decorationPayloads], attributes.print_methods, supplierDecorationPrices)
    const rows = group.records.flatMap((item) => variantRows((item.payload || {}) as ObjectValue))
    const seen = new Set<string>()
    const seenSkus = new Set<string>()
    const variants = rows
      .map((row, index) => {
        const sku = value(row, ["sku", "SKU", "optionalReference", "reference", "variant_id"]) || `${record.external_id}-${index + 1}`
        const color = value(row, ["color_description", "colour_description", "color", "colour", "color_group"]) || "Standard"
        const colorCode = value(row, ["color_code", "colour_code", "colorCode", "colourCode"])
        const colorGroup = value(row, ["color_group", "colour_group", "color_family", "colour_family"]) || color
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
          const colorCode = value(row, ["color_code", "colour_code", "colorCode", "colourCode", "color"])
          if (colorCode) {
            variantImages = [`https://cdn.hideacontent.com/public/products/1000x1000/${group.master_id}_${colorCode}.jpg`]
          }
        }
        return {
          source_id: value(row, ["variant_id", "id", "ID"]) || sku,
          sku,
          title: [color, size === "Standard" ? "" : size].filter(Boolean).join(" "),
          color,
          color_code: colorCode,
          color_group: colorGroup,
          size,
          images: proxyImages(variantImages),
          price_eur: pricesFound.length ? Math.min(...pricesFound) : undefined,
          stock_quantity: stocksFound.length ? stocksFound.reduce((sum, item) => sum + item, 0) : undefined,
        }
      })
      .filter((variant) => {
        if (seenSkus.has(variant.sku)) return false
        seenSkus.add(variant.sku)
        return true
      })
    const sourceKey = opaqueSourceKey(group.supplier_id, group.master_id)
    const productImages = [...proxyImages(imageUrls(group.records.map((item) => item.payload))), ...variants.flatMap((variant) => variant.images)].filter((url, index, all) => all.indexOf(url) === index)
    const description = value(payload, ["long_description", "longDescription", "description", "Description"])
    return {
      source_key: sourceKey,
      supplier_code: supplier?.code || "unknown",
      supplier_name: supplier?.display_name || "Unknown supplier",
      title: value(payload, ["product_name", "name", "Name", "description", "Description"]) || "Merchandise product",
      description,
      short_description: catalogSummary(description, value(payload, ["short_description", "shortDescription", "summary"])),
      category: originalCategory,
      supplier_category: originalCategory,
      category_mapping_id: undefined,
      category_status: "unmapped",
      lead_time: attributes.lead_time,
      sustainable: attributes.sustainable,
      print_methods: [...new Set([...attributes.print_methods, ...decorationOptions.map((method) => method.name)])],
      decoration_options: decorationOptions,
      attributes: {
        materials: attributes.materials,
        brand: attributes.brand,
        country_of_origin: attributes.country_of_origin,
        dimensions: attributes.dimensions,
        weight: attributes.weight,
        keywords: attributes.keywords,
      },
      images: productImages,
      variants,
      published: published.has(sourceKey),
    }
  })
}

export function normalizedProductHandle(product: NormalizedProduct) {
  return `merch-${createHash("sha256").update(product.source_key).digest("hex").slice(0, 16)}`
}
