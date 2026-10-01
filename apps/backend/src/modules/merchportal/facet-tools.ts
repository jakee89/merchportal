import { createHash, randomUUID } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { clearPortalCatalogCache } from "./catalog-cache"
import { categoryFilterPath, documentFacetValues, facetMappingOptions, facetTypes, type FacetType, type FacetOption } from "./facet-mappings"
import { facetProtections, protectionKey, storedProtections } from "./facet-protection"
import { isProtectedTarget, mappingPreview, targetKey, taxonomyAttention } from "./facet-taxonomy-rules"

export type MappingSource = { supplier_id: string; source_value: string }
export type MappingGroup = { target_value: string | null; sources: MappingSource[] }
export const facetSourceKey = (type: FacetType, source: MappingSource) => `${source.supplier_id}:${type}:${source.source_value.trim().toLocaleLowerCase()}`

export function validateMappingGroups(type: FacetType, groups: MappingGroup[]) {
  if (!facetTypes.includes(type) || !Array.isArray(groups) || !groups.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose filter groups to apply")
  const seen = new Set<string>()
  let count = 0
  for (const group of groups) {
    if ((group.target_value !== null && (typeof group.target_value !== "string" || !group.target_value.trim() || group.target_value.length > 80)) || !Array.isArray(group.sources) || !group.sources.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a filter name of up to 80 characters")
    if (type === "category" && group.target_value !== null) {
      try { categoryFilterPath(group.target_value) } catch (error) { throw new MedusaError(MedusaError.Types.INVALID_DATA, (error as Error).message) }
    }
    for (const source of group.sources) {
      if (typeof source?.supplier_id !== "string" || !source.supplier_id || typeof source.source_value !== "string" || !source.source_value.trim() || source.source_value.length > 160) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid supplier value")
      const key = facetSourceKey(type, source)
      if (seen.has(key)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A supplier value cannot belong to two groups")
      seen.add(key)
      count++
    }
  }
  if (count > 20000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Select at most 20,000 values per operation")
}

export async function trackFacetValues(container: any, sources: Array<{ supplier_id: string; catalog_preview: any }>, codes: Map<string, string>) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows = new Map<string, any>()
  for (const source of sources) for (const [type, value] of documentFacetValues(source.catalog_preview, codes.get(source.supplier_id))) {
    const sourceValue = value.trim().toLocaleLowerCase()
    const id = `fv_${createHash("md5").update(`${source.supplier_id}:${type}:${sourceValue}`).digest("hex")}`
    rows.set(id, { id, supplier_id: source.supplier_id, facet_type: type, source_value: sourceValue, first_seen_at: new Date() })
  }
  const values = [...rows.values()]
  for (let offset = 0; offset < values.length; offset += 200) await knex("merchportal_facet_value").insert(values.slice(offset, offset + 200)).onConflict("id").ignore()
}

export async function facetDashboard(service: any) {
  const [options, seen, jobs, changes, reviews] = await Promise.all([
    facetMappingOptions(service), service.listFacetValues({}, { take: 50000 }),
    service.listImportJobs({ kind: "catalog", status: "completed" }, { take: 100, order: { completed_at: "DESC" } }),
    service.listFacetOperations({ kind: "change" }, { take: 10, order: { created_at: "DESC" } }),
    service.listFacetOperations({ kind: "ai_review" }, { take: 5, order: { created_at: "DESC" } }),
  ])
  const seenByKey = new Map<string, any>(seen.map((item: any) => [facetSourceKey(item.facet_type, item), item]))
  const protections = await facetProtections(service)
  const latest = new Map<string, any>()
  for (const job of jobs) if (!job.log?.dry_run && !latest.has(job.supplier_id)) latest.set(job.supplier_id, job)
  return {
    protections,
    attention: taxonomyAttention(options),
    options: options.map((option) => {
      const firstSeen = seenByKey.get(facetSourceKey(option.facet_type, option))?.first_seen_at
      const job = latest.get(option.supplier_id)
      return { ...option, first_seen_at: firstSeen, new_since_import: Boolean(!option.target_value && firstSeen && job?.started_at && new Date(firstSeen) >= new Date(job.started_at) && new Date(firstSeen) <= new Date(job.completed_at)) }
    }),
    changes: changes.map((item: any) => ({ id: item.id, facet_type: item.facet_type, status: item.status, created_at: item.created_at, count: item.data.entries?.length || 0 })),
    reviews: reviews.map((item: any) => ({ id: item.id, facet_type: item.facet_type, status: item.status, created_at: item.created_at })),
  }
}

export function suggestedFacetGroups(options: FacetOption[]) {
  const groups = new Map<string, FacetOption[]>()
  for (const option of options) {
    const normalized = (option.target_value || option.source_value).normalize("NFKC").toLocaleLowerCase().replace(/\bgray\b/gu, "grey").replace(/[\p{P}\p{Z}\s]+/gu, " ").trim()
    const key = `${option.facet_type}:${normalized}`
    groups.set(key, [...(groups.get(key) || []), option])
  }
  return [...groups.values()].filter((group) => group.length > 1 && group.some((option) => !option.target_value)).map((group) => ({ facet_type: group[0].facet_type, target_value: group.find((item) => item.target_value)?.target_value || group[0].source_value.replace(/\bgray\b/giu, "Grey").trim(), sources: group.map(({ supplier_id, source_value }) => ({ supplier_id, source_value })), count: group.reduce((sum, item) => sum + item.count, 0) })).sort((a, b) => b.count - a.count)
}

export async function applyFacetChange(container: any, actorId: string, type: FacetType, groups: MappingGroup[], baseline?: Map<string, string | null>) {
  validateMappingGroups(type, groups)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = new Set((await service.listSuppliers({})).map((item: any) => item.id))
  if (groups.some((group) => group.sources.some((source) => !suppliers.has(source.supplier_id)))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Supplier not found")
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const id = `fop_${randomUUID()}`
  await knex.transaction(async (tx: any) => {
    await tx.raw("select pg_advisory_xact_lock(hashtext('merchportal:facet-mappings'))")
    const current = await tx("merchportal_facet_mapping").where({ facet_type: type }).whereNull("deleted_at")
    const protections = storedProtections(await tx("merchportal_setting").where({ key: protectionKey }).whereNull("deleted_at").first())
    const canonical = new Map<string, string>(current.map((row: any) => [targetKey(row.target_value), row.target_value]))
    const byKey = new Map<string, any>(current.map((row: any) => [facetSourceKey(type, row), row]))
    const entries: any[] = []
    const inserts: any[] = []
    for (const group of groups) for (const source of group.sources) {
      const key = facetSourceKey(type, source)
      const existing = byKey.get(key)
      const before = existing?.target_value || null
      const requested = group.target_value?.trim() || null
      const after = requested ? canonical.get(targetKey(requested)) || requested : null
      if (after) canonical.set(targetKey(after), after)
      if (baseline && (!baseline.has(key) || baseline.get(key) !== before)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Mappings changed during this review. Generate a fresh review before applying")
      if (before === after) continue
      if (isProtectedTarget(type, before, protections)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unlock ${before} before changing its structure`)
      const mappingId = existing?.id || `fm_${randomUUID()}`
      if (existing) await tx("merchportal_facet_mapping").where({ id: mappingId }).update({ target_value: after || before, deleted_at: after ? null : new Date(), updated_at: new Date() })
      else if (after) inserts.push({ id: mappingId, supplier_id: source.supplier_id, facet_type: type, source_value: source.source_value.trim(), target_value: after })
      entries.push({ ...source, mapping_id: mappingId, before, after })
    }
    for (let offset = 0; offset < inserts.length; offset += 100) await tx("merchportal_facet_mapping").insert(inserts.slice(offset, offset + 100))
    await tx("merchportal_facet_operation").insert({ id, actor_id: actorId, kind: "change", status: "applied", facet_type: type, data: JSON.stringify({ entries }) })
  })
  clearPortalCatalogCache()
  return id
}

export async function renameFacetMap(container: any, actorId: string, type: FacetType, from: string, to: string) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const mappings = await service.listFacetMappings({ facet_type: type, target_value: from }, { take: 20000 })
  if (!mappings.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Saved map not found")
  return applyFacetChange(container, actorId, type, [{ target_value: to, sources: mappings }], new Map(mappings.map((item: any) => [facetSourceKey(type, item), from])))
}

export async function undoFacetChange(container: any, id: string) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  await knex.transaction(async (tx: any) => {
    await tx.raw("select pg_advisory_xact_lock(hashtext('merchportal:facet-mappings'))")
    const operation = await tx("merchportal_facet_operation").where({ id, kind: "change", status: "applied" }).whereNull("deleted_at").first()
    if (!operation) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This change cannot be undone")
    const protections = storedProtections(await tx("merchportal_setting").where({ key: protectionKey }).whereNull("deleted_at").first())
    for (const entry of operation.data.entries) {
      if (isProtectedTarget(operation.facet_type, entry.after, protections)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unlock ${entry.after} before undoing this change`)
      const mapping = await tx("merchportal_facet_mapping").where({ id: entry.mapping_id }).first()
      const newer = await tx("merchportal_facet_mapping").where({ supplier_id: entry.supplier_id, facet_type: operation.facet_type }).whereNull("deleted_at").whereRaw("lower(trim(source_value)) = ?", [entry.source_value.trim().toLocaleLowerCase()]).first()
      if ((newer?.target_value || null) !== entry.after || (newer && newer.id !== entry.mapping_id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A later edit changed this map. Undo newer changes first")
      if (!mapping) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Mapping history is unavailable")
      await tx("merchportal_facet_mapping").where({ id: mapping.id }).update({ target_value: entry.before || mapping.target_value, deleted_at: entry.before ? null : new Date(), updated_at: new Date() })
    }
    await tx("merchportal_facet_operation").where({ id }).update({ status: "undone", updated_at: new Date() })
  })
  clearPortalCatalogCache()
}

export async function previewFacetChange(container: any, type: FacetType, groups: MappingGroup[]) {
  validateMappingGroups(type, groups)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const [options, protections, suppliers] = await Promise.all([facetMappingOptions(service), facetProtections(service), service.listSuppliers({})])
  const codes = new Map<string, string>(suppliers.map((supplier: any) => [supplier.id, supplier.code]))
  const touched = new Set(groups.flatMap((group) => group.sources.map((source) => facetSourceKey(type, source))))
  const preview = mappingPreview(type, options, groups)
  const planned = new Map(groups.flatMap((group) => group.sources.map((source) => [facetSourceKey(type, source), group.target_value] as const)))
  const locked = options.filter((option) => option.facet_type === type && touched.has(facetSourceKey(type, option)) && isProtectedTarget(type, option.target_value, protections) && targetKey(planned.get(facetSourceKey(type, option)) || "") !== targetKey(option.target_value!)).map((option) => option.target_value!)
  const affected = new Set<string>()
  const products: Array<{ id: string; name: string }> = []
  for (let skip = 0; ; skip += 1000) {
    const batch = await service.listPublishedProductSources({}, { take: 1000, skip, select: ["supplier_id", "product_id", "catalog_preview"] })
    for (const source of batch) {
      const document = source.catalog_preview || {}
      if (!documentFacetValues(document, codes.get(source.supplier_id)).some(([facet, value]) => facet === type && touched.has(facetSourceKey(type, { supplier_id: source.supplier_id, source_value: value })))) continue
      const id = document.id || source.product_id
      if (!id || affected.has(id)) continue
      affected.add(id)
      if (products.length < 8) products.push({ id, name: document.name || "Product" })
    }
    if (batch.length < 1000) break
  }
  return { ...preview, affected_products: affected.size, products, blocked: [...new Set(locked)].map((name) => `Unlock ${name} before changing its structure`) }
}
