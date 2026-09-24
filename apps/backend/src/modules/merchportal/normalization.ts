import { createHash, createHmac } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MERCHPORTAL_MODULE } from "."
import { categoryHierarchy, fieldValue, normalizedFieldName, productAttributes, productSpecifications, supplierCategory } from "./catalog-rules"
import { normalizeDecorationOptions, type DecorationMethod } from "./decoration"
import { supplierImageToken } from "./media"
import { interruptibleSupplierRead } from "./sync"

type ObjectValue = Record<string, any>

export type NormalizedVariant = {
  source_id: string
  sku: string
  title: string
  color: string
  color_code?: string
  color_hex?: string
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

function numberValue(object: unknown, keys: string[], integer = false): number | undefined {
  if (!object || typeof object !== "object") return
  for (const [key, child] of Object.entries(object as ObjectValue)) {
    if (keys.some((candidate) => normalizedFieldName(candidate) === normalizedFieldName(key))) {
      const text = typeof child === "string" ? child.trim() : child
      const normalized = integer && typeof text === "string" && /^\d{1,3}(?:\.\d{3})+$/u.test(text)
        ? text.replace(/\./gu, "")
        : typeof text === "string" ? text.replace(",", ".") : text
      const parsed = Number(normalized)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  for (const child of Object.values(object as ObjectValue)) {
    const found = numberValue(child, keys, integer)
    if (found !== undefined) return found
  }
}

function trustedImageHost(hostname: string) {
  const host = hostname.toLowerCase()
  return ["cdn.hideacontent.com", "cdn1.midocean.com", "cdn.aodaci.com", "content.aodaci.com"].includes(host) || host.endsWith(".cdn.midocean.com")
}

function strickerProductImage(value: string) {
  const filename = value.split(",")[0].trim().replace(/^\/+/, "")
  if (!filename) return
  if (/^https:\/\//iu.test(filename)) return filename
  return `https://cdn.hideacontent.com/public/products/1000x1000/${filename}`
}

function imageUrls(object: unknown, supplierCode?: string, output = new Set<string>()): string[] {
  if (Array.isArray(object)) {
    object.forEach((item) => imageUrls(item, supplierCode, output))
  } else if (object && typeof object === "object") {
    const entry = object as ObjectValue
    if (entry.type !== "document") {
      for (const [key, candidate] of Object.entries(entry)) {
        const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase()
        const isProductImage = /^(mainimage|optionalimage\d*|image|imageurl|urlhighress|picture|itempicturefront)$/u.test(normalized)
        const isAssetUrl = normalized === "url" && typeof candidate === "string" && /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/iu.test(candidate)
        if ((!isProductImage && !isAssetUrl) || typeof candidate !== "string") continue
        const resolved = supplierCode === "stricker" && isProductImage ? strickerProductImage(candidate) : candidate
        if (resolved && /^https:\/\//iu.test(resolved)) {
          try {
            const url = new URL(resolved)
            if (trustedImageHost(url.hostname) && (/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/iu.test(url.href) || url.pathname.toLowerCase().includes("/image/"))) output.add(resolved)
          } catch {}
        }
      }
    }
    Object.values(entry).forEach((child) => imageUrls(child, supplierCode, output))
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
  const explicit = value(payload, ["product_reference", "productReference", "ProdReference", "master_id", "master_code", "parent_reference", "main_reference"])
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
  return urls.flatMap((url) => {
    const token = supplierImageToken(url)
    return token ? [`/media/${token}`] : []
  })
}

function supplierAssetUrl(value: string, supplierCode?: string) {
  const first = value.split(",")[0].trim()
  if (/^https:\/\//iu.test(first)) return first
  if (supplierCode !== "stricker") return value
  const clean = first.replace(/^\/+/, "")
  if (clean.startsWith("public/")) return `https://cdn.hideacontent.com/${clean}`
  return `https://cdn.hideacontent.com/public/printings/printinglines/500x500/${clean}`
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
    const quantity = numberValue(item, ["minimum_quantity", "min_quantity", "from_quantity", "quantity", "qty"], true)
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
      const quantity = numberValue(payload, [`${prefix}_arrival_qty`, `${prefix}_arrival_quantity`, `${prefix}ArrivalQty`], true)
      if (date && quantity !== undefined && quantity > 0) arrivals.push({ date, quantity: Math.floor(quantity) })
    }
  }
  return arrivals.filter((item, index, all) => all.findIndex((other) => other.date === item.date && other.quantity === item.quantity) === index).sort((left, right) => left.date.localeCompare(right.date))
}

async function listAllRawSupplierRecords(service: any, filters: Record<string, unknown>, order?: Record<string, "ASC" | "DESC">, onPage?: (count: number) => Promise<void>, checkCancelled?: () => Promise<void>) {
  const records: any[] = []
  const take = onPage ? 2000 : 5000
  for (let skip = 0; ; skip += take) {
    const batch = await interruptibleSupplierRead<any[]>(() => service.listRawSupplierRecords(filters, { take, skip, order }), `Loading ${String(filters.record_type || "supplier")} records`, checkCancelled)
    records.push(...batch)
    await onPage?.(records.length)
    if (batch.length < take) return records
  }
}

async function listAllPublishedSources(service: any, filters: Record<string, unknown>, onPage?: (count: number) => Promise<void>, checkCancelled?: () => Promise<void>) {
  const sources: any[] = []
  const take = onPage ? 2000 : 5000
  for (let skip = 0; ; skip += take) {
    const batch = await interruptibleSupplierRead<any[]>(() => service.listPublishedProductSources(filters, { take, skip }), "Loading published supplier links", checkCancelled)
    sources.push(...batch)
    await onPage?.(sources.length)
    if (batch.length < take) return sources
  }
}

export async function normalizeSupplierCatalog(container: MedusaContainer, options: { source_keys?: string[]; supplier_code?: string; take?: number; skip?: number; onProgress?: (completed: number, total: number) => Promise<void>; onStage?: (message: string) => Promise<void>; checkCancelled?: () => Promise<void> } = {}): Promise<NormalizedProduct[]> {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = await service.listSuppliers(options.supplier_code ? { code: options.supplier_code } : {})
  const supplierById = new Map<string, any>(suppliers.map((supplier: any) => [supplier.id, supplier]))
  const supplierIds = [...supplierById.keys()]
  if (!supplierIds.length) return []
  const filters = (recordType: string) => ({ record_type: recordType, supplier_id: supplierIds })
  const report = (label: string) => options.onStage ? async (count: number) => { await options.onStage?.(`Loading ${label} (${count.toLocaleString()} records)`) } : undefined
  const [records, prices, stocks, decorations, decorationPrices] = await Promise.all([
    listAllRawSupplierRecords(service, filters("product"), { updated_at: "DESC" }, report("products"), options.checkCancelled),
    listAllRawSupplierRecords(service, filters("price"), undefined, report("prices"), options.checkCancelled),
    listAllRawSupplierRecords(service, filters("stock"), undefined, report("stock"), options.checkCancelled),
    listAllRawSupplierRecords(service, filters("decoration"), undefined, report("print options"), options.checkCancelled),
    listAllRawSupplierRecords(service, filters("decoration_price"), undefined, report("print prices"), options.checkCancelled),
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
  const existingSources = await listAllPublishedSources(service, { supplier_id: supplierIds }, report("published products"), options.checkCancelled)
  const published = new Set(existingSources.map((source: any) => source.source_key).filter((key: string) => selectedSourceKeySet.has(key)))
  const normalized: NormalizedProduct[] = []
  await options.onProgress?.(0, selectedGroups.length)
  for (const [index, group] of selectedGroups.entries()) {
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
        images: position.images?.map((image) => ({
          ...image,
          url: proxyImages([supplierAssetUrl(image.url, supplier?.code)])[0],
        })).filter((image) => image.url),
      })),
    })).filter((method) => method.positions.length && (method.price_breaks.length || method.price_ranges?.length || method.price_tables?.length))
    const rows = group.records.flatMap((item) => variantRows((item.payload || {}) as ObjectValue))
    const seen = new Set<string>()
    const seenSkus = new Set<string>()
    const variants = rows
      .map((row, index) => {
        const sku = value(row, ["sku", "SKU", "optionalReference", "reference", "variant_id"]) || `${record.external_id}-${index + 1}`
        const colorCode = value(row, ["color_code", "colour_code", "colorCode", "colourCode", "ColorCode", "Color1", "color"])
        const suppliedHex = value(row, ["ColorHex1", "color_hex", "colour_hex"])
        const colorHex = suppliedHex && /^#?[0-9a-f]{6}$/iu.test(suppliedHex) ? `#${suppliedHex.replace(/^#/u, "")}` : undefined
        const color = value(row, ["ColorDesc1", "ColorDescription", "color_description", "colour_description", "color_name", "colour_name", "color", "colour", "color_group"]) || colorCode || "Standard"
        const colorGroup = value(row, ["color_group", "colour_group", "color_family", "colour_family"]) || color
        let size = value(row, ["size_description", "size", "combined_sizes", "capacity", "format", "dimension"]) || "Standard"
        const combination = `${color}:${size}`
        if (seen.has(combination)) size = sku
        seen.add(`${color}:${size}`)
        const priceMatches = matchingRecords(priceIndex, group.supplier_id, sku, group.master_id)
        const stockMatches = matchingRecords(stockIndex, group.supplier_id, sku, group.master_id)
        const priceBreaks = productPriceBreaks(priceMatches.length ? priceMatches : [row])
        const stocksFound = stockMatches.map((item) => numberValue(item.payload, ["qty", "stock", "quantity", "available", "free_stock"], true)).filter((item): item is number => item !== undefined)
        const suppliedVariantImage = supplier?.code === "stricker" ? value(row, ["OptionalImage1", "optional_image_1"]) : undefined
        const preferredImage = suppliedVariantImage ? strickerProductImage(suppliedVariantImage) : supplier?.code === "stricker" && colorCode
          ? strickerProductImage(`${group.master_id}_${colorCode}.jpg`)
          : undefined
        const variantImages = [preferredImage, ...imageUrls(row, supplier?.code)].filter((image, imageIndex, all): image is string => Boolean(image) && all.indexOf(image) === imageIndex)
        return {
          source_id: value(row, ["variant_id", "id", "ID"]) || sku,
          sku,
          title: [color, size === "Standard" ? "" : size].filter(Boolean).join(" "),
          color,
          color_code: colorCode,
          color_hex: colorHex,
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
    const productImages = [...proxyImages(imageUrls(group.records.map((item) => item.payload), supplier?.code)), ...variants.flatMap((variant) => variant.images)].filter((url, index, all) => all.indexOf(url) === index)
    const description = value(payload, ["long_description", "longDescription", "seo_description", "seodescription", "description", "Description"])
    normalized.push({
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
    })
    if ((index + 1) % 20 === 0 || index + 1 === selectedGroups.length) {
      await options.onProgress?.(index + 1, selectedGroups.length)
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }
  return normalized
}

export function normalizedProductHandle(product: NormalizedProduct) {
  return `merch-${createHash("sha256").update(product.source_key).digest("hex").slice(0, 16)}`
}
