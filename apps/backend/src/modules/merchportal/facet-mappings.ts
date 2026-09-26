import { colorLabel } from "./catalog-filtering"

export type FacetType = "color" | "material"
export type FacetMappingInput = { supplier_id: string; facet_type: FacetType; source_value: string; target_value: string }

function key(supplierId: string, type: FacetType, value: string) {
  return `${supplierId}\u0000${type}\u0000${value.trim().toLocaleLowerCase()}`
}

export function facetMappingIndex(mappings: FacetMappingInput[]) {
  return new Map(mappings.map((item) => [key(item.supplier_id, item.facet_type, item.source_value), item.target_value]))
}

export function applyFacetMappings<T extends { materials?: string[]; colors?: string[]; color_options?: Array<{ name: string }>; filter_variants?: Array<{ color?: string; color_group?: string }> }>(
  product: T,
  supplierId: string,
  mappings: Map<string, string>,
): T {
  const mapValue = (type: FacetType, value: string) => mappings.get(key(supplierId, type, value)) || value
  const mapColor = (value: string) => mapValue("color", value) === value
    ? mapValue("color", colorLabel(value))
    : mapValue("color", value)
  return {
    ...product,
    materials: product.materials?.map((value) => mapValue("material", value)).filter((value, index, all) => all.indexOf(value) === index),
    colors: product.colors?.map(mapColor),
    color_options: product.color_options?.map((option) => ({ ...option, name: mapColor(option.name) })),
    filter_variants: product.filter_variants?.map((variant) => ({
      ...variant,
      color_group: variant.color_group ? mapColor(variant.color_group) : variant.color ? mapColor(variant.color) : undefined,
    })),
  }
}

export async function saveFacetMappings(service: any, input: { facet_type: FacetType; sources: Array<{ supplier_id: string; source_value: string }>; target_value: string }) {
  const target = input.target_value.trim()
  const values = [...new Map(input.sources.map((item) => [key(item.supplier_id, input.facet_type, item.source_value), { supplier_id: item.supplier_id, source_value: item.source_value.trim() }])).values()]
  if (!target || target.length > 80 || !values.length || values.length > 100 || values.some((item) => !item.supplier_id || !item.source_value || item.source_value.length > 160) || !["color", "material"].includes(input.facet_type)) {
    throw new Error("Choose 1–100 values and enter a target name of up to 80 characters")
  }
  const suppliers = await service.listSuppliers({})
  if (values.some((item) => !suppliers.some((supplier: any) => supplier.id === item.supplier_id))) throw new Error("Supplier not found")
  const existing = await service.listFacetMappings({ facet_type: input.facet_type }, { take: 5000 })
  const bySource = new Map(existing.map((item: any) => [key(item.supplier_id, input.facet_type, item.source_value), item]))
  for (const value of values) {
    const current = bySource.get(key(value.supplier_id, input.facet_type, value.source_value)) as any
    if (current) await service.updateFacetMappings({ id: current.id, target_value: target })
    else await service.createFacetMappings({ supplier_id: value.supplier_id, facet_type: input.facet_type, source_value: value.source_value, target_value: target })
  }
}

export async function removeFacetMappings(service: any, input: { facet_type: FacetType; sources: Array<{ supplier_id: string; source_value: string }> }) {
  if (!["color", "material"].includes(input.facet_type) || !input.sources.length || input.sources.length > 100) throw new Error("Choose 1–100 mapped values")
  const selected = new Set(input.sources.map((item) => key(item.supplier_id, input.facet_type, item.source_value)))
  const mappings = await service.listFacetMappings({ facet_type: input.facet_type }, { take: 5000 })
  const ids = mappings.filter((item: any) => selected.has(key(item.supplier_id, input.facet_type, item.source_value))).map((item: any) => item.id)
  if (ids.length) await service.deleteFacetMappings(ids)
}

export async function facetMappingOptions(service: any) {
  const [suppliers, sources, mappings] = await Promise.all([
    service.listSuppliers({}),
    service.listPublishedProductSources({}, { take: 50000, select: ["supplier_id", "catalog_preview"] }),
    service.listFacetMappings({}, { take: 5000 }),
  ])
  const names = new Map(suppliers.map((item: any) => [item.id, item.display_name]))
  const targets = facetMappingIndex(mappings)
  const counts = new Map<string, { supplier_id: string; supplier_name: string; facet_type: FacetType; source_value: string; target_value?: string; count: number }>()
  for (const source of sources) {
    const document = source.catalog_preview || {}
    const values: Array<[FacetType, string]> = [
      ...(document.variants || []).map((variant: any) => ["color", variant.color_group || variant.color] as [FacetType, string]),
      ...(document.materials || []).map((value: string) => ["material", value] as [FacetType, string]),
    ]
    for (const [type, value] of new Map(values.filter((item) => item[1]).map((item) => [key(source.supplier_id, item[0], item[1]), item])).values()) {
      const id = key(source.supplier_id, type, value)
      const current = counts.get(id)
      if (current) current.count += 1
      else counts.set(id, { supplier_id: source.supplier_id, supplier_name: String(names.get(source.supplier_id) || "Supplier"), facet_type: type, source_value: value, target_value: targets.get(id), count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => a.facet_type.localeCompare(b.facet_type) || a.source_value.localeCompare(b.source_value) || a.supplier_name.localeCompare(b.supplier_name))
}
