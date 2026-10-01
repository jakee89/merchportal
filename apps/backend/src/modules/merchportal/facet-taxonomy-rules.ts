import type { FacetOption, FacetType } from "./facet-mappings"

export type ProtectedFacet = { facet_type: FacetType; target_value: string }
export const targetKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase()
export const sourceKey = (source: { supplier_id: string; source_value: string }) => `${source.supplier_id}\u0000${targetKey(source.source_value)}`

export function isProtectedTarget(type: FacetType, value: string | null | undefined, locks: ProtectedFacet[]) {
  if (!value) return false
  const key = targetKey(value)
  return locks.some((lock) => lock.facet_type === type && (targetKey(lock.target_value) === key || (type === "category" && key.startsWith(`${targetKey(lock.target_value)} > `))))
}

export function canonicalSuggestions(value: string, destinations: string[]) {
  const tokens = (name: string) => new Set(targetKey(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((word) => word.length > 3 ? word.replace(/s$/u, "") : word))
  const requested = tokens(value)
  if (!requested.size) return []
  return [...new Set(destinations)].filter((name) => targetKey(name) !== targetKey(value)).map((name) => {
    const known = tokens(name)
    const common = [...requested].filter((word) => known.has(word)).length
    return { name, score: common / Math.max(requested.size, known.size) }
  }).filter((item) => item.score >= 0.5).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5).map((item) => item.name)
}

export function mappingPreview(type: FacetType, options: FacetOption[], groups: Array<{ target_value: string | null; sources: Array<{ supplier_id: string; source_value: string }> }>) {
  const relevant = options.filter((option) => option.facet_type === type)
  const changes = new Map(groups.flatMap((group) => group.sources.map((source) => [sourceKey(source), group.target_value] as const)))
  const active = relevant.filter((option) => option.count > 0)
  const filters = (name: string) => type === "category" && name.includes(">") ? [targetKey(name.split(">")[0]), targetKey(name)] : [targetKey(name)]
  const before = new Set(active.flatMap((option) => filters(option.target_value || option.source_value)))
  const after = new Set(active.flatMap((option) => filters(changes.has(sourceKey(option)) ? changes.get(sourceKey(option)) || option.source_value : option.target_value || option.source_value)))
  const warnings: string[] = []
  for (const group of groups) {
    if (!group.target_value) continue
    const labels = new Set(group.sources.map((source) => targetKey(source.source_value)))
    if (/^(other|miscellaneous|products|general|accessories)$/iu.test(group.target_value.split(">").slice(-1)[0]!.trim()) || labels.size >= 20) warnings.push(`${group.target_value}: ${labels.size} distinct labels combined; check that this is not too broad.`)
    const similar = canonicalSuggestions(group.target_value, relevant.flatMap((option) => option.target_value ? [option.target_value] : []))
    if (similar.length) warnings.push(`${group.target_value}: check existing destinations ${similar.join(", ")} before creating a new name.`)
  }
  return { source_labels: active.length, before_filters: before.size, after_filters: after.size, selected_labels: changes.size, warnings: [...new Set(warnings)] }
}

export function categoryBranchGroups(options: FacetOption[], from: string, to: string, entireBranch: boolean) {
  const groups = new Map<string, { target_value: string; sources: Array<{ supplier_id: string; source_value: string }> }>()
  for (const option of options) {
    if (option.facet_type !== "category" || !option.target_value) continue
    const path = option.target_value.split(">").map((part) => part.trim())
    const matches = entireBranch ? targetKey(path[0]) === targetKey(from) : targetKey(option.target_value) === targetKey(from)
    if (!matches) continue
    const target = entireBranch ? [to.trim(), ...path.slice(1)].join(" > ") : to.trim()
    const group = groups.get(target) || { target_value: target, sources: [] }
    group.sources.push(option)
    groups.set(target, group)
  }
  return [...groups.values()]
}

export function taxonomyAttention(options: FacetOption[]) {
  const issues: Array<{ facet_type: FacetType; target_value: string; issue: string; sources: FacetOption[] }> = []
  for (const option of options) {
    if (option.target_value && !option.count) issues.push({ facet_type: option.facet_type, target_value: option.target_value, issue: "Unused mapping — no current products", sources: [option] })
    else if (/^\d+$/u.test(option.source_value.trim())) issues.push({ facet_type: option.facet_type, target_value: option.target_value || option.source_value, issue: "Opaque numeric label — needs identification", sources: [option] })
  }
  const children = new Map<string, FacetOption[]>()
  const variants = new Map<string, FacetOption[]>()
  for (const option of options.filter((item) => item.target_value)) {
    const target = option.target_value!
    const normalized = targetKey(target).replace(/\bgray\b/gu, "grey").replace(/s\b/gu, "")
    const variantKey = `${option.facet_type}:${normalized}`
    variants.set(variantKey, [...(variants.get(variantKey) || []), option])
    if (option.facet_type === "category" && target.includes(">")) {
      const child = targetKey(target.split(">").slice(-1)[0]!)
      children.set(child, [...(children.get(child) || []), option])
    }
  }
  for (const sources of children.values()) if (new Set(sources.map((source) => targetKey(source.target_value!.split(">")[0]))).size > 1) issues.push({ facet_type: "category", target_value: sources[0].target_value!, issue: "Same subcategory under different parents — review whether intentional", sources })
  for (const sources of variants.values()) if (new Set(sources.map((source) => source.target_value)).size > 1) issues.push({ facet_type: sources[0].facet_type, target_value: sources[0].target_value!, issue: "Likely duplicate destination names", sources })
  return issues
}
