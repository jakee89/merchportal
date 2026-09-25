import { createHash } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { createSupplierAdapter, SyncKind } from "./adapters"
import { resolveSupplierCredential } from "./supplier-credentials"

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
const NORMALIZER_VERSION = "2026-09-12.3"

export class ImportCancelledError extends Error {
  constructor() {
    super("Import stopped by staff")
    this.name = "ImportCancelledError"
  }
}

export async function interruptibleSupplierRead<T>(read: () => Promise<T>, label: string, checkCancelled?: () => Promise<void>, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<T> {
  await checkCancelled?.()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let checking = false
  const interruption = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round((options.timeoutMs || 90_000) / 1000)} seconds`)), options.timeoutMs || 90_000)
    if (checkCancelled) {
      poll = setInterval(() => {
        if (checking) return
        checking = true
        checkCancelled().catch(reject).finally(() => { checking = false })
      }, options.pollMs || 2_000)
    }
  })
  try {
    return await Promise.race([read(), interruption])
  } finally {
    if (timeout) clearTimeout(timeout)
    if (poll) clearInterval(poll)
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
  if (job.status === "failed" && String(job.error_message || "").startsWith("Import watchdog:")) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, job.error_message)
  if (job.status !== "cancelling" && job.status !== "cancelled") return false
  if (job.status === "cancelling") {
    await updateImportJobActivity(service, id, {
      status: "cancelled",
      phase: "cancelled",
      current_message: "Stopped by staff",
      completed_at: new Date(),
    })
  }
  throw new ImportCancelledError()
}

export async function reconcileStaleImportJobs(service: any) {
  const jobs = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
  const now = Date.now()
  for (const job of jobs) {
    const idleFor = now - new Date(job.updated_at || job.created_at).getTime()
    if (job.status === "cancelling" && idleFor > 60_000) {
      await updateImportJobActivity(service, job.id, {
        status: "cancelled",
        phase: "cancelled",
        current_message: "Stopped after the worker became unresponsive",
        completed_at: new Date(),
      })
    } else if ((job.status === "running" || job.status === "queued") && idleFor > 5 * 60_000) {
      await updateImportJobActivity(service, job.id, {
        status: "failed",
        phase: "failed",
        current_message: "The worker stopped reporting progress for 5 minutes. Check the log before retrying.",
        error_message: `Import watchdog: no progress was reported for 5 minutes during ${job.phase || "unknown"}`,
        error_count: 1,
        completed_at: new Date(),
      })
    }
  }
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
  const accepted = new Set(keys.map((key) => key.toLowerCase()))
  for (const [key, value] of Object.entries(record)) {
    if (accepted.has(key.toLowerCase()) && value !== undefined && value !== null && String(value).length) {
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
  const masterId = objectValue(value, ["master_id", "master_code", "product_code", "model", "ProductReference", "ProdReference", "Reference"])
  const serviceCode = objectValue(value, ["service_code", "serviceCode", "technique_id", "techniqueId", "TableFullCode", "TableCode"])
  const positionCode = objectValue(value, ["position_id", "positionId", "location_id", "locationId", "location_code", "locationCode"]) ||
    [objectValue(value, ["Component"]), objectValue(value, ["Location"])].filter(Boolean).join("|")
  const tableOption = objectValue(value, ["TableCodeOption", "table_code_option"])
  const decorationId = [masterId, serviceCode, positionCode, tableOption].filter(Boolean).join(":")
  const externalId = type === "decoration" || type === "decoration_price"
    ? decorationId || objectValue(value, ["variant_id", "id", "ID"])
    : masterId ?? objectValue(value, ["variant_id", "id", "ID", "TableFullCode", "TableCode", "service_code"])
  return {
    externalId: (preferSku ? (sku ?? externalId) : (externalId ?? sku)) ?? `record-${index}`,
    sku,
  }
}

function preferSkuIdentity(supplierCode: SupplierCode, type: RawRecordType) {
  return type === "price" || type === "stock" || (supplierCode === "stricker" && type === "product") || (supplierCode === "midocean" && type === "decoration")
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
      preferSkuIdentity(supplierCode, type),
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
  await reconcileStaleImportJobs(service)
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

  const active = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
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
    const active = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
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
    const adapter = createSupplierAdapter(supplierCode, resolveSupplierCredential(supplierCode, supplier.configuration))
    const abortController = new AbortController()
    const cancellationPoll = setInterval(() => {
      service.retrieveImportJob(job.id).then((current: any) => {
        if (current.status === "cancelling") abortController.abort()
      }).catch(() => undefined)
    }, 1_000)
    let lastDownloadUpdate = 0
    const fetchContext = (label: string) => ({
      signal: abortController.signal,
      onDownloadProgress: async (receivedBytes: number, totalBytes?: number) => {
        if (Date.now() - lastDownloadUpdate < 1_000 && receivedBytes !== totalBytes) return
        lastDownloadUpdate = Date.now()
        const detail = totalBytes
          ? `${Math.round((receivedBytes / totalBytes) * 100)}%`
          : `${(receivedBytes / 1_000_000).toFixed(1)} MB`
        await updateImportJobActivity(service, job.id, {
          current_message: `Downloading ${label} from ${supplier.display_name} (${detail})`,
          progress_percent: totalBytes ? Math.max(2, Math.min(5, 2 + Math.floor((receivedBytes / totalBytes) * 3))) : 3,
        })
        await stopIfImportCancelled(service, job.id)
      },
    })
    let records: unknown[] = []
    let decorationRecords: unknown[] = []
    let decorationPriceRecords: unknown[] = []
    try {
      records = kind === "catalog"
        ? await adapter.fetchProducts(fetchContext("products"))
        : kind === "price"
          ? await adapter.fetchPrices(fetchContext("prices"))
          : await adapter.fetchStock(fetchContext("stock"))
      if (kind === "catalog") {
        decorationRecords = await (adapter.fetchDecorations?.(fetchContext("print options")) || [])
        decorationPriceRecords = await (adapter.fetchDecorationPrices?.(fetchContext("print prices")) || [])
      }
    } finally {
      clearInterval(cancellationPoll)
    }
    const recordType = kind === "catalog" ? "product" : kind
    const now = new Date()
    let created = 0
    let updated = 0
    let skipped = 0
    const changedRecords: Array<{ type: RawRecordType; externalId: string; sku?: string; payload: RecordObject }> = []
    let sharedDecorationChanged = false

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
      const incomingIds = new Set(uniqueItems.map((record, index) => recordIdentity(
        record,
        index,
        preferSkuIdentity(supplierCode, type),
        type,
      ).externalId))
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
          preferSkuIdentity(supplierCode, type),
          type,
        )
        const checksum = createHash("sha256").update(`${NORMALIZER_VERSION}:${JSON.stringify(record)}`).digest("hex")
        const existing = existingById.get(externalId)
        if (!existing || existing.checksum !== checksum) {
          if (type === "decoration" || type === "decoration_price") sharedDecorationChanged = true
          else changedRecords.push({ type, externalId, sku, payload: record as RecordObject })
        }

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
          skipped += 1
        }
        processed += 1
        if (creates.length + updates.length >= 250) await flush()
      }
      processed += items.length - uniqueItems.length
      await flush()
      const stale = uniqueItems.length ? existingRecords.filter((item: any) => !incomingIds.has(item.external_id)) : []
      for (const record of stale) {
        if (type === "decoration" || type === "decoration_price") sharedDecorationChanged = true
        else changedRecords.push({ type, externalId: record.external_id, sku: record.sku, payload: record.payload || {} })
      }
      const staleIds = stale.map((item: any) => item.id)
      for (let index = 0; index < staleIds.length; index += 500) {
        await service.deleteRawSupplierRecords(staleIds.slice(index, index + 500))
      }
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
    return { ...(await service.retrieveImportJob(job.id)), already_running: false, changed_records: changedRecords, shared_decoration_changed: sharedDecorationChanged }
  } catch (error) {
    const current = await service.retrieveImportJob(job.id)
    if (current.status === "cancelling") {
      await updateImportJobActivity(service, job.id, {
        status: "cancelled",
        phase: "cancelled",
        current_message: "Stopped by staff",
        completed_at: new Date(),
      })
      return { ...(await service.retrieveImportJob(job.id)), already_running: false }
    }
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
      log: {
        failure: {
          at: new Date().toISOString(),
          phase: current.phase,
          type: error instanceof Error ? error.name : "Error",
          message,
        },
      },
    })
    await service.updateSuppliers({ id: supplier.id, last_error: message })
    throw error
  }
}

export { supplierCredentialStatus } from "./supplier-credentials"
