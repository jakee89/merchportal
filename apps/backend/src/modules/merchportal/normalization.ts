import { createHash, createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MERCHPORTAL_MODULE } from "."
import { categoryHierarchy, fieldValue, normalizedFieldName, productAttributes, productSpecifications, supplierCategory } from "./catalog-rules"
import { normalizeDecorationOptions, type DecorationMethod } from "./decoration"
import { supplierImageToken } from "./media"

type ObjectValue = Record<string, any>

export type NormalizedVariant = {
  source_id: string
  sku: string
  title: string
  color: string
  color_code?: string
  color_group?: string
  size: string
  ean?: string
  pantone?: string
  dimensions?: string
  images: string[]
  price_eur?: number
  price_breaks: Array<{ quantity: number; price_eur: number }>
  stock_quantity?: number
  future_stock: Array<{ date: string; quantity: number }>
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
    specifications: Array<{ label: string; value: string }>
  }
  category_hierarchy: string[]
  downloads: Array<{ name: string; url: string }>
  images: string[]
  variants: NormalizedVariant[]
  published: boolean
}

function value(object: ObjectValue, keys: string[]) {
  const entries = new Map(Object.entries(object || {}).map(([key, found]) => [normalizedFieldName(key), found]))
  for (const requested of keys) {
    const found = entries.get(normalizedFieldName(requested))
    if (found !== undefined && found !== null && typeof found !== "object" && String(found).trim()) return String(found).trim()
  }
}

function numberValue(object: unknown, keys: string[]): number | undefined {
  if (!object || typeof object !== "object") return
  for (const [key, child] of Object.entries(object as ObjectValue)) {
    if (keys.some((candidate) => normalizedFieldName(candidate) === normalizedFieldName(key))) {
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
      const imageKeys = new Set(["url", "urlhighress", "image", "imageurl", "picture"])
      for (const [key, candidate] of Object.entries(entry)) {
        if (!imageKeys.has(key.replace(/[^a-z]/giu, "").toLowerCase())) continue
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
  for (const [key, child] of Object.entries(payload)) {
    if (["variants", "optionals", "productoptionals", "productoptional", "items", "skus", "colours", "colors"].includes(normalizedFieldName(key)) && Array.isArray(child) && child.length) {
      return child as ObjectValue[]
    }
  }
  return [payload]
}

function downloadUrls(object: unknown, output = new Map<string, string>()): Array<{ name: string; url: string }> {
  if (Array.isArray(object)) object.forEach((item) => downloadUrls(item, output))
  else if (object && typeof object === "object") {
    for (const [name, candidate] of Object.entries(object as ObjectValue)) {
      const key = normalizedFieldName(name)
      if (typeof candidate === "string" && /^https:\/\//iu.test(candidate) && /(document|download|datasheet|productsheet|specification|template|certificate|instruction|manual|pdf)/iu.test(key)) {
        output.set(candidate, name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " "))
      }
      downloadUrls(candidate, output)
    }
  }
  return [...output].map(([url, name]) => ({ name, url }))
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

function recordKeys(item: any, supplierCode?: string) {
  const payload = (item.payload || {}) as ObjectValue
  const sku = item.sku || fieldValue(payload, ["sku", "optional_reference", "optionalReference", "web_sku", "websku", "reference"])
  const master = supplierMasterReference(supplierCode, payload, item.external_id)
  return { sku, master }
}

function proxyImages(urls: string[]) {
  const backend = (process.env.MEDUSA_BACKEND_URL || "").replace(/\/$/u, "")
  if (!backend) return []
  return urls.flatMap((url) => {
    const token = supplierImageToken(url)
    return token ? [`${backend}/media/${token}`] : []
  })
}

function supplierAssetUrl(value: string, supplierCode?: string) {
  if (/^https:\/\//iu.test(value)) return value
  if (supplierCode !== "stricker") return value
  const clean = value.replace(/^\/+/, "")
  if (clean.startsWith("public/")) return `https://cdn.hideacontent.com/${clean}`
  return `https://cdn.hideacontent.com/public/products/printings/printinglines/500x500/${clean}`
}

function indexedRecords(items: any[], supplierById: Map<string, any>) {
  const bySku = new Map<string, any[]>()
  const byMaster = new Map<string, any[]>()
  const add = (map: Map<string, any[]>, key: string | undefined, item: any) => {
    if (!key) return
    const fullKey = `${item.supplier_id}:${key}`
    const bucket = map.get(fullKey)
    if (bucket) bucket.push(item)
    else map.set(fullKey, [item])
  }
  for (const item of items) {
    const supplier = supplierById.get(item.supplier_id)
    const keys = recordKeys(item, supplier?.code)
    add(bySku, keys.sku, item)
    add(byMaster, keys.master, item)
  }
  return { bySku, byMaster }
}

function matchingRecords(index: ReturnType<typeof indexedRecords>, supplierId: string, sku: string, masterId: string) {
  return index.bySku.get(`${supplierId}:${sku}`) || index.byMaster.get(`${supplierId}:${masterId}`) || []
}

export function productPriceBreaks(items: any[]) {
  const breaks = new Map<number, number>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== "object") return
    const item = value as ObjectValue
    for (const [name, rawPrice] of Object.entries(item)) {
      const match = name.replace(/[^a-z0-9]/giu, "").match(/^(?:your)?price(\d+)$/iu)
      const price = Number(typeof rawPrice === "string" ? rawPrice.replace(",", ".") : rawPrice)
      if (match && Number.isFinite(price) && price >= 0) breaks.set(Number(match[1]), price)
    }
    const quantity = numberValue(item, ["minimum_quantity", "min_quantity", "from_quantity", "quantity", "qty"])
    const price = numberValue(item, ["price", "your_price", "yourprice", "unit_price", "net_price", "price_1"])
    if (quantity !== undefined && price !== undefined && quantity > 0 && price >= 0) breaks.set(Math.floor(quantity), price)
    Object.values(item).forEach(visit)
  }
  items.forEach((item) => {
    const payload = item.payload || item
    const base = numberValue(payload, ["your_price", "yourprice", "price", "unit_price", "net_price", "price_1"])
    if (base !== undefined && base >= 0 && !breaks.has(1)) breaks.set(1, base)
    visit(payload)
  })
  return [...breaks.entries()]
    .map(([quantity, price_eur]) => ({ quantity, price_eur }))
    .sort((left, right) => left.quantity - right.quantity)
}

export function futureStock(items: any[]) {
  const arrivals: Array<{ date: string; quantity: number }> = []
  for (const item of items) {
    const payload = (item.payload || item) as ObjectValue
    for (const prefix of ["first", "next", "second"]) {
      const date = value(payload, [`${prefix}_arrival_date`, `${prefix}ArrivalDate`])
      const quantity = numberValue(payload, [`${prefix}_arrival_qty`, `${prefix}_arrival_quantity`, `${prefix}ArrivalQty`])
      if (date && quantity !== undefined && quantity > 0) arrivals.push({ date, quantity: Math.floor(quantity) })
    }
  }
  return arrivals.filter((item, index, all) => all.findIndex((other) => other.date === item.date && other.quantity === item.quantity) === index).sort((left, right) => left.date.localeCompare(right.date))
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

async function listAllPublishedSources(service: any, filters: Record<string, unknown>) {
  const sources: any[] = []
  const take = 5000
  for (let skip = 0; ; skip += take) {
    const batch = await service.listPublishedProductSources(filters, { take, skip })
    sources.push(...batch)
    if (batch.length < take) return sources
  }
}

export async function normalizeSupplierCatalog(container: MedusaContainer, options: { source_keys?: string[]; supplier_code?: string; take?: number; skip?: number } = {}): Promise<NormalizedProduct[]> {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = await service.listSuppliers(options.supplier_code ? { code: options.supplier_code } : {})
  const supplierById = new Map<string, any>(suppliers.map((supplier: any) => [supplier.id, supplier]))
  const supplierIds = [...supplierById.keys()]
  if (!supplierIds.length) return []
  const filters = (recordType: string) => ({ record_type: recordType, supplier_id: supplierIds })
  const [records, prices, stocks, decorations, decorationPrices] = await Promise.all([
    listAllRawSupplierRecords(service, filters("product"), { updated_at: "DESC" }),
    listAllRawSupplierRecords(service, filters("price")),
    listAllRawSupplierRecords(service, filters("stock")),
    listAllRawSupplierRecords(service, filters("decoration")),
    listAllRawSupplierRecords(service, filters("decoration_price")),
  ])
  const priceIndex = indexedRecords(prices, supplierById)
  const stockIndex = indexedRecords(stocks, supplierById)
  const decorationIndex = indexedRecords(decorations, supplierById)
  const decorationPricesBySupplier = new Map<string, any[]>()
  for (const item of decorationPrices) {
    const bucket = decorationPricesBySupplier.get(item.supplier_id)
    if (bucket) bucket.push(item.payload)
    else decorationPricesBySupplier.set(item.supplier_id, [item.payload])
  }
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
  const selectedSourceKeySet = new Set(sourceKeys)
  const existingSources = await listAllPublishedSources(service, { supplier_id: supplierIds })
  const published = new Set(existingSources.map((source: any) => source.source_key).filter((key: string) => selectedSourceKeySet.has(key)))
  return selectedGroups.map((group) => {
    const record = group.records[0]
    const payload = (record.payload || {}) as ObjectValue
    const supplier = supplierById.get(group.supplier_id)
    const originalCategory = supplierCategory(group.records.map((item) => item.payload))
    const attributes = productAttributes(group.records.map((item) => item.payload))
    const specifications = productSpecifications(group.records.map((item) => item.payload))
    const hierarchy = categoryHierarchy(group.records.map((item) => item.payload))
    const decorationPayloads = (decorationIndex.byMaster.get(`${group.supplier_id}:${group.master_id}`) || []).map((item: any) => item.payload)
    const supplierDecorationPrices = decorationPricesBySupplier.get(group.supplier_id) || []
    const decorationOptions = normalizeDecorationOptions([...group.records.map((item) => item.payload), ...decorationPayloads], attributes.print_methods, supplierDecorationPrices).map((method) => ({
      ...method,
      positions: method.positions.map((position) => ({
        ...position,
        image_url: position.image_url ? proxyImages([supplierAssetUrl(position.image_url, supplier?.code)])[0] : undefined,
      })),
    }))
    const rows = group.records.flatMap((item) => variantRows((item.payload || {}) as ObjectValue))
    const seen = new Set<string>()
    const seenSkus = new Set<string>()
    const variants = rows
      .map((row, index) => {
        const sku = value(row, ["sku", "SKU", "optionalReference", "reference", "variant_id"]) || `${record.external_id}-${index + 1}`
        const colorCode = value(row, ["color_code", "colour_code", "colorCode", "colourCode", "color"])
        const color = value(row, ["color_description", "colour_description", "color_name", "colour_name", "color", "colour", "color_group"]) || colorCode || "Standard"
        const colorGroup = value(row, ["color_group", "colour_group", "color_family", "colour_family"]) || color
        let size = value(row, ["size_description", "size", "combined_sizes", "capacity", "format", "dimension"]) || "Standard"
        const combination = `${color}:${size}`
        if (seen.has(combination)) size = sku
        seen.add(`${color}:${size}`)
        const priceMatches = matchingRecords(priceIndex, group.supplier_id, sku, group.master_id)
        const stockMatches = matchingRecords(stockIndex, group.supplier_id, sku, group.master_id)
        const priceBreaks = productPriceBreaks(priceMatches.length ? priceMatches : [row])
        const stocksFound = stockMatches.map((item) => numberValue(item.payload, ["qty", "stock", "quantity", "available", "free_stock"])).filter((item): item is number => item !== undefined)
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
          ean: value(row, ["ean", "ean13", "barcode", "gtin"]),
          pantone: value(row, ["pantone", "pms", "pms_color", "pms_colour"]),
          dimensions: value(row, ["combined_sizes", "dimensions", "size_description"]),
          images: proxyImages(variantImages),
          price_eur: priceBreaks[0]?.price_eur,
          price_breaks: priceBreaks,
          stock_quantity: stocksFound.length ? stocksFound.reduce((sum, item) => sum + item, 0) : undefined,
          future_stock: futureStock(stockMatches),
        }
      })
      .filter((variant) => {
        if (seenSkus.has(variant.sku)) return false
        seenSkus.add(variant.sku)
        return true
      })
    const sourceKey = opaqueSourceKey(group.supplier_id, group.master_id)
    const productImages = [...proxyImages(imageUrls(group.records.map((item) => item.payload))), ...variants.flatMap((variant) => variant.images)].filter((url, index, all) => all.indexOf(url) === index)
    const description = value(payload, ["long_description", "longDescription", "seo_description", "seodescription", "description", "Description"])
    return {
      source_key: sourceKey,
      supplier_code: supplier?.code || "unknown",
      supplier_name: supplier?.display_name || "Unknown supplier",
      title: value(payload, ["product_name", "seo_name", "seoname", "name", "Name", "description", "Description"]) || "Merchandise product",
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
        specifications,
      },
      category_hierarchy: hierarchy.length ? hierarchy : [originalCategory],
      downloads: downloadUrls(group.records.map((item) => item.payload)),
      images: productImages,
      variants,
      published: published.has(sourceKey),
    }
  })
}

export function normalizedProductHandle(product: NormalizedProduct) {
  return `merch-${createHash("sha256").update(product.source_key).digest("hex").slice(0, 16)}`
}
