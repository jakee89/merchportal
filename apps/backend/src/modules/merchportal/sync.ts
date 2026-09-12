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

export class ImportCancelledError extends Error {
  constructor() {
    super("Import stopped by staff")
    this.name = "ImportCancelledError"
  }
}

export async function updateImportJobActivity(service: any, id: string, data: Record<string, unknown>) {
  const job = await service.retrieveImportJob(id)
  const log = job.log && typeof job.log === "object" ? job.log : {}
  const events = Array.isArray(log.events) ? log.events.slice(-39) : []
  const message = typeof data.current_message === "string" ? data.current_message : undefined
  const phase = typeof data.phase === "string" ? data.phase : job.phase
  const last = events[events.length - 1] as { phase?: string; message?: string } | undefined
  if (message && (last?.phase !== phase || last?.message !== message)) {
    events.push({ at: new Date().toISOString(), phase, message })
  }
  const updateLog = data.log && typeof data.log === "object" ? data.log : {}
  return service.updateImportJobs({ id, ...data, log: { ...log, ...updateLog, events } })
}

export async function stopIfImportCancelled(service: any, id: string) {
  const job = await service.retrieveImportJob(id)
  if (job.status !== "cancelling") return false
  await updateImportJobActivity(service, id, {
    status: "cancelled",
    phase: "cancelled",
    current_message: "Stopped by staff",
    completed_at: new Date(),
  })
  throw new ImportCancelledError()
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.length) return message
    try {
      return JSON.stringify(error).slice(0, 2_000)
    } catch {}
  }
  return "Supplier sync failed"
}

function objectValue(record: RecordObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).length) {
      return String(value).trim()
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

function isExistingRawRecordError(error: unknown) {
  return error instanceof Error && /raw supplier record.+already exists/i.test(error.message)
}

async function listAllRawSupplierRecords(service: any, filters: Record<string, unknown>) {
  const records: any[] = []
  const take = 5000
  for (let skip = 0; ; skip += take) {
    const batch = await service.listRawSupplierRecords(filters, { take, skip })
    records.push(...batch)
    if (batch.length < take) return records
  }
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

export async function queueSupplierSync(
  container: MedusaContainer,
  supplierCode: SupplierCode,
  kind: SyncKind,
  trigger: "manual" | "scheduled",
  options: { dryRun?: boolean } = {},
) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const supplier = (await ensureSuppliers(container)).find((item: any) => item.code === supplierCode)
  if (!supplier) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supplier is not configured")

  const active = await service.listImportJobs({ supplier_id: supplier.id }, { take: 10, order: { created_at: "DESC" } })
  const existing = active.find((job: any) => job.status === "queued" || job.status === "running" || job.status === "cancelling")
  if (existing) return { ...existing, already_running: true }

  const job = await service.createImportJobs({
    supplier_id: supplier.id,
    kind,
    trigger,
    status: "queued",
    phase: "queued",
    current_message: `Queued ${kind} update for ${supplier.display_name}`,
    progress_percent: 0,
    log: {
      dry_run: Boolean(options.dryRun),
      events: [{ at: new Date().toISOString(), phase: "queued", message: `Queued ${kind} update for ${supplier.display_name}` }],
    },
  })
  return { ...job, already_running: false }
}

export async function runSupplierSync(
  container: MedusaContainer,
  supplierCode: SupplierCode,
  kind: SyncKind,
  trigger: "manual" | "scheduled",
  options: { dryRun?: boolean; jobId?: string } = {},
) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const supplier = (await ensureSuppliers(container)).find((item: any) => item.code === supplierCode)
  if (!supplier) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supplier is not configured")

  let job: any
  if (options.jobId) {
    const queued = await service.retrieveImportJob(options.jobId)
    if (queued.supplier_id !== supplier.id || queued.kind !== kind || queued.status !== "queued") {
      return { ...queued, already_running: true }
    }
    await updateImportJobActivity(service, queued.id, {
      status: "running",
      phase: "downloading",
      current_message: `Downloading ${kind} data from ${supplier.display_name}`,
      progress_percent: 2,
      started_at: new Date(),
    })
    job = await service.retrieveImportJob(queued.id)
  } else {
    const active = await service.listImportJobs({ supplier_id: supplier.id }, { take: 10, order: { created_at: "DESC" } })
    const existing = active.find((item: any) => item.status === "queued" || item.status === "running" || item.status === "cancelling")
    if (existing) return { ...existing, already_running: true }
    job = await service.createImportJobs({
      supplier_id: supplier.id,
      kind,
      trigger,
      status: "running",
      phase: "downloading",
      current_message: `Downloading ${kind} data from ${supplier.display_name}`,
      progress_percent: 2,
      started_at: new Date(),
    })
  }

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
    await updateImportJobActivity(service, job.id, {
      phase: "importing",
      current_message: `Importing ${totalRecords.toLocaleString()} supplier records`,
      total_records: totalRecords,
      progress_percent: 5,
    })

    const persistRecords = async (items: unknown[], type: RawRecordType) => {
      const existingRecords = await listAllRawSupplierRecords(service, { supplier_id: supplier.id, record_type: type })
      const existingById = new Map<string, any>(existingRecords.map((item: any) => [item.external_id, item]))
      const uniqueItems = deduplicateSupplierRecords(items, supplierCode, type)
      skipped += items.length - uniqueItems.length
      let creates: any[] = []
      let updates: any[] = []
      const flush = async () => {
        if (creates.length) {
          try {
            await service.createRawSupplierRecords(creates)
          } catch (error) {
            if (!isExistingRawRecordError(error)) throw error
            for (const record of creates) {
              const existing = await service.listRawSupplierRecords(
                {
                  supplier_id: supplier.id,
                  record_type: type,
                  external_id: record.external_id,
                },
                { take: 1 },
              )
              if (!existing.length) {
                await service.createRawSupplierRecords(record)
                continue
              }
              created -= 1
              if (existing[0].checksum === record.checksum) {
                skipped += 1
                await service.updateRawSupplierRecords({
                  id: existing[0].id,
                  import_job_id: job.id,
                  source_image_urls: record.source_image_urls,
                  last_seen_at: now,
                })
              } else {
                updated += 1
                await service.updateRawSupplierRecords({
                  id: existing[0].id,
                  import_job_id: job.id,
                  sku: record.sku,
                  checksum: record.checksum,
                  payload: record.payload,
                  source_image_urls: record.source_image_urls,
                  last_seen_at: now,
                })
              }
            }
          }
        }
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
        await stopIfImportCancelled(service, job.id)
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
    await stopIfImportCancelled(service, job.id)
    await persistRecords(decorationRecords, "decoration")
    await stopIfImportCancelled(service, job.id)
    await persistRecords(decorationPriceRecords, "decoration_price")
    await stopIfImportCancelled(service, job.id)

    await updateImportJobActivity(service, job.id, {
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
    if (!options.dryRun) {
      await service.updateSuppliers({
        id: supplier.id,
        [`${kind === "catalog" ? "product" : kind}_sync_at`]: new Date(),
        last_error: null,
      })
    }
    return { ...(await service.retrieveImportJob(job.id)), already_running: false }
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      return { ...(await service.retrieveImportJob(job.id)), already_running: false }
    }
    const message = errorMessage(error)
    await updateImportJobActivity(service, job.id, {
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
