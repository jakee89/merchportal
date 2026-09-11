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

function objectValue(record: RecordObject, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && String(value).length) {
      return String(value)
    }
  }
}

function recordIdentity(record: unknown, index: number, preferSku = false) {
  const value = (record && typeof record === "object" ? record : {}) as RecordObject
  const sku = objectValue(value, ["sku", "SKU", "Sku", "optionalReference", "reference"])
  const externalId = objectValue(value, [
    "master_id",
    "master_code",
    "variant_id",
    "id",
    "ID",
    "ProductReference",
    "Reference",
  ])
  return {
    externalId: (preferSku ? sku ?? externalId : externalId ?? sku) ?? `record-${index}`,
    sku,
  }
}

function imageUrls(value: unknown, output = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => imageUrls(item, output))
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as RecordObject)) {
      if (
        typeof child === "string" &&
        /^https:\/\//i.test(child) &&
        /(image|picture|photo|url|asset)/i.test(key)
      ) {
        try {
          const assetUrl = new URL(child)
          if (
            ["cdn.hideacontent.com", "cdn1.midocean.com"].includes(assetUrl.hostname) &&
            (/\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(assetUrl.href) ||
              assetUrl.pathname.toLowerCase().includes("/image/"))
          ) {
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

export async function runSupplierSync(
  container: MedusaContainer,
  supplierCode: SupplierCode,
  kind: SyncKind,
  trigger: "manual" | "scheduled"
) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const supplier = (await ensureSuppliers(container)).find(
    (item: any) => item.code === supplierCode
  )
  if (!supplier) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supplier is not configured")

  const running = await service.listImportJobs(
    { supplier_id: supplier.id, kind, status: "running" },
    { take: 1 }
  )
  if (running.length) return running[0]

  const job = await service.createImportJobs({
    supplier_id: supplier.id,
    kind,
    trigger,
    status: "running",
    started_at: new Date(),
  })

  try {
    const adapter = createSupplierAdapter(supplierCode)
    const records =
      kind === "catalog"
        ? await adapter.fetchProducts()
        : kind === "price"
          ? await adapter.fetchPrices()
          : await adapter.fetchStock()
    const recordType = kind === "catalog" ? "product" : kind
    const now = new Date()
    let created = 0
    let updated = 0
    let skipped = 0

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      const { externalId, sku } = recordIdentity(
        record,
        index,
        supplierCode === "stricker" && kind === "catalog"
      )
      const checksum = createHash("sha256")
        .update(JSON.stringify(record))
        .digest("hex")
      const existing = await service.listRawSupplierRecords(
        { supplier_id: supplier.id, record_type: recordType, external_id: externalId },
        { take: 1 }
      )

      if (!existing.length) {
        await service.createRawSupplierRecords({
          supplier_id: supplier.id,
          import_job_id: job.id,
          record_type: recordType,
          external_id: externalId,
          sku,
          checksum,
          payload: record,
          source_image_urls: imageUrls(record),
          first_seen_at: now,
          last_seen_at: now,
        })
        created += 1
      } else if (existing[0].checksum !== checksum) {
        await service.updateRawSupplierRecords({
          id: existing[0].id,
          import_job_id: job.id,
          sku,
          checksum,
          payload: record,
          source_image_urls: imageUrls(record),
          last_seen_at: now,
        })
        updated += 1
      } else {
        await service.updateRawSupplierRecords({
          id: existing[0].id,
          import_job_id: job.id,
          source_image_urls: imageUrls(record),
          last_seen_at: now,
        })
        skipped += 1
      }
    }

    await service.updateImportJobs({
      id: job.id,
      status: "completed",
      processed: records.length,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      completed_at: new Date(),
      log: { message: "Differential import completed" },
    })
    await service.updateSuppliers({
      id: supplier.id,
      [`${kind === "catalog" ? "product" : kind}_sync_at`]: new Date(),
      last_error: null,
    })
    return service.retrieveImportJob(job.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier sync failed"
    await service.updateImportJobs({
      id: job.id,
      status: "failed",
      error_count: 1,
      error_message: message,
      completed_at: new Date(),
    })
    await service.updateSuppliers({ id: supplier.id, last_error: message })
    throw error
  }
}

export function supplierCredentialStatus(code: SupplierCode) {
  return Boolean(
    code === "stricker"
      ? process.env.STRICKER_ACCESS_KEY
      : process.env.MIDOCEAN_API_KEY
  )
}
