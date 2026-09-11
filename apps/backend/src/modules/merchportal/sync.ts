import { createHash } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { createSupplierAdapter, SyncKind } from "./adapters"

const suppliers = {
  stricker: {
    display_name: "Stricker",
    credential_env_var: "STRICKER_ACCESS_KEY",
  },
  midocean: {
    display_name: "midocean",
    credential_env_var: "MIDOCEAN_API_KEY",
  },
} as const

type SupplierCode = keyof typeof suppliers
type RecordObject = Record<string, unknown>
type RawRecordType = "product" | "price" | "stock" | "decoration" | "decoration_price"

function objectValue(record: RecordObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).length) {
      return String(value)
    }
  }
}

function recordIdentity(
  record: unknown,
  index: number,
  preferSku = false,
  type?: RawRecordType,
) {
  const value = (record && typeof record === "object" ? record : {}) as RecordObject
  const sku = objectValue(value, ["sku", "SKU", "Sku", "optionalReference", "reference"])
  const masterId = objectValue(value, ["master_id", "master_code", "ProductReference", "Reference"])
  const serviceCode = objectValue(value, ["service_code", "serviceCode", "technique_id", "techniqueId", "TableFullCode", "TableCode"])
  const positionCode = objectValue(value, ["position_id", "positionId", "location_id", "locationId", "location_code", "locationCode"])
  const decorationId = [masterId, serviceCode, positionCode].filter(Boolean).join(":")
  const externalId = type === "decoration" || type === "decoration_price"
    ? decorationId || objectValue(value, ["variant_id", "id", "ID"])
    : masterId ?? objectValue(value, ["variant_id", "id", "ID", "TableFullCode", "TableCode", "service_code"])
  return {
    externalId: (preferSku ? (sku ?? externalId) : (externalId ?? sku)) ?? `record-${index}`,
    sku,
  }
}

export function deduplicateSupplierRecords(
  records: unknown[],
  supplierCode: SupplierCode,
  type: RawRecordType,
) {
  const recordsById = new Map<string, unknown>()
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const { externalId } = recordIdentity(
      record,
      index,
      supplierCode === "stricker" && type === "product",
      type,
    )
    recordsById.set(externalId, record)
  }
  return [...recordsById.values()]
}

function imageUrls(value: unknown, output = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => imageUrls(item, output))
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as RecordObject)) {
      if (typeof child === "string" && /^https:\/\//i.test(child) && /(image|picture|photo|url|asset)/i.test(key)) {
        try {
          const assetUrl = new URL(child)
          if (["cdn.hideacontent.com", "cdn1.midocean.com"].includes(assetUrl.hostname) && (/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(assetUrl.href) || assetUrl.pathname.toLowerCase().includes("/image/"))) {
            output.add(child)
          }
        } catch {}
      } else {
        imageUrls(child, output)
      }
    }
  }
  return [...output]
}

export async function ensureSuppliers(container: MedusaContainer) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  for (const [code, definition] of Object.entries(suppliers)) {
    const existing = await service.listSuppliers({ code }, { take: 1 })
    if (!existing.length) {
      await service.createSuppliers({ code, ...definition, status: "active" })
    }
  }
  return service.listSuppliers({}, { order: { display_name: "ASC" } })
}

export async function runSupplierSync(container: MedusaContainer, supplierCode: SupplierCode, kind: SyncKind, trigger: "manual" | "scheduled") {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const supplier = (await ensureSuppliers(container)).find((item: any) => item.code === supplierCode)
  if (!supplier) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supplier is not configured")

  const running = await service.listImportJobs({ supplier_id: supplier.id, kind, status: "running" }, { take: 1 })
  if (running.length) return { ...running[0], already_running: true }

  const job = await service.createImportJobs({
    supplier_id: supplier.id,
    kind,
    trigger,
    status: "running",
    phase: "downloading",
    current_message: `Downloading ${kind} data from ${supplier.display_name}`,
    progress_percent: 2,
    started_at: new Date(),
  })

  try {
    const adapter = createSupplierAdapter(supplierCode)
    const records = kind === "catalog" ? await adapter.fetchProducts() : kind === "price" ? await adapter.fetchPrices() : await adapter.fetchStock()
    const [decorationRecords, decorationPriceRecords] = kind === "catalog" ? await Promise.all([adapter.fetchDecorations?.() || [], adapter.fetchDecorationPrices?.() || []]) : [[], []]
    const recordType = kind === "catalog" ? "product" : kind
    const now = new Date()
    let created = 0
    let updated = 0
    let skipped = 0

    const totalRecords = records.length + decorationRecords.length + decorationPriceRecords.length
    let processed = 0
    await service.updateImportJobs({
      id: job.id,
      phase: "importing",
      current_message: `Importing ${totalRecords.toLocaleString()} supplier records`,
      total_records: totalRecords,
      progress_percent: 5,
    })

    const persistRecords = async (items: unknown[], type: RawRecordType) => {
      const existingRecords = await service.listRawSupplierRecords({ supplier_id: supplier.id, record_type: type }, { take: 50000 })
      const existingById = new Map<string, any>(existingRecords.map((item: any) => [item.external_id, item]))
      const uniqueItems = deduplicateSupplierRecords(items, supplierCode, type)
      skipped += items.length - uniqueItems.length
      let creates: any[] = []
      let updates: any[] = []
      const flush = async () => {
        if (creates.length) await service.createRawSupplierRecords(creates)
        if (updates.length) await service.updateRawSupplierRecords(updates)
        creates = []
        updates = []
        await service.updateImportJobs({
          id: job.id,
          processed,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          progress_percent: Math.min(55, 5 + Math.floor((processed / Math.max(1, totalRecords)) * 50)),
          current_message: `Importing ${type.replace("_", " ")} records (${processed.toLocaleString()} of ${totalRecords.toLocaleString()})`,
        })
      }
      for (let index = 0; index < uniqueItems.length; index += 1) {
        const record = uniqueItems[index]
        const { externalId, sku } = recordIdentity(
          record,
          index,
          supplierCode === "stricker" && type === "product",
          type,
        )
        const checksum = createHash("sha256").update(JSON.stringify(record)).digest("hex")
        const existing = existingById.get(externalId)

        if (!existing) {
          creates.push({
            supplier_id: supplier.id,
            import_job_id: job.id,
            record_type: type,
            external_id: externalId,
            sku,
            checksum,
            payload: record,
            source_image_urls: imageUrls(record),
            first_seen_at: now,
            last_seen_at: now,
          })
          created += 1
        } else if (existing.checksum !== checksum) {
          updates.push({
            id: existing.id,
            import_job_id: job.id,
            sku,
            checksum,
            payload: record,
            source_image_urls: imageUrls(record),
            last_seen_at: now,
          })
          updated += 1
        } else {
          updates.push({
            id: existing.id,
            import_job_id: job.id,
            source_image_urls: imageUrls(record),
            last_seen_at: now,
          })
          skipped += 1
        }
        processed += 1
        if (creates.length + updates.length >= 250) await flush()
      }
      processed += items.length - uniqueItems.length
      if (creates.length || updates.length) await flush()
    }
    await persistRecords(records, recordType)
    await persistRecords(decorationRecords, "decoration")
    await persistRecords(decorationPriceRecords, "decoration_price")

    await service.updateImportJobs({
      id: job.id,
      status: "running",
      phase: "normalizing",
      current_message: "Normalizing products, variants, colours and pricing",
      progress_percent: kind === "catalog" ? 58 : 75,
      processed: totalRecords,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      log: {
        message: "Differential supplier import completed",
        supplier_records: records.length,
        decoration_records: decorationRecords.length,
        decoration_price_records: decorationPriceRecords.length,
      },
    })
    await service.updateSuppliers({
      id: supplier.id,
      [`${kind === "catalog" ? "product" : kind}_sync_at`]: new Date(),
      last_error: null,
    })
    return { ...(await service.retrieveImportJob(job.id)), already_running: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier sync failed"
    await service.updateImportJobs({
      id: job.id,
      status: "failed",
      phase: "failed",
      current_message: message,
      progress_percent: 100,
      error_count: 1,
      error_message: message,
      completed_at: new Date(),
    })
    await service.updateSuppliers({ id: supplier.id, last_error: message })
    throw error
  }
}

export function supplierCredentialStatus(code: SupplierCode) {
  return Boolean(code === "stricker" ? process.env.STRICKER_ACCESS_KEY : process.env.MIDOCEAN_API_KEY)
}
