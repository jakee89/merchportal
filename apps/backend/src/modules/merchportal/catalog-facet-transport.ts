import { createHash } from "node:crypto"

const fields = ["categories", "colors", "sizes", "materials", "brands", "lead_times", "print_methods"] as const
type FacetSet = Record<string, any>

export function facetSchema(base: FacetSet) {
  const labels: string[] = []
  const ids = new Map<string, number>()
  const id = (label: string) => {
    if (!ids.has(label)) { ids.set(label, labels.length); labels.push(label) }
    return ids.get(label)!
  }
  const tree = (base.category_tree?.roots || []).map((root: any) => [id(root.value), root.children.map((child: any) => id(child.value))])
  const groups = Object.fromEntries(fields.map((field) => [field, base[field].map((entry: any) => id(entry.value))]))
  const structure = { labels, fields: groups, tree }
  const schema = { id: createHash("sha256").update(JSON.stringify(structure)).digest("hex"), ...structure }
  return { schema, ids }
}

export function facetTransport(base: ReturnType<typeof facetSchema>, current: FacetSet, knownSchema?: unknown): { facets?: FacetSet; schema_id?: string; schema?: ReturnType<typeof facetSchema>["schema"]; counts?: FacetSet } {
  const values = fields.flatMap((field) => current[field].map((entry: any) => entry.value))
  const roots = current.category_tree?.roots || []
  values.push(...roots.flatMap((root: any) => [root.value, ...root.children.map((child: any) => child.value)]))
  // Retain unknown/deleted selected values with their zero counts. Legacy
  // clients and uncommon selections still receive the exact original facets.
  if (values.some((value) => !base.ids.has(value))) return { facets: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, Array.isArray(value) ? value.map((entry: any) => [entry.value, entry.count]) : value])) }
  return {
    schema_id: base.schema.id,
    ...(knownSchema === base.schema.id ? {} : { schema: base.schema }),
    counts: {
      ...Object.fromEntries(fields.map((field) => [field, current[field].map((entry: any) => [base.ids.get(entry.value), entry.count])])),
      category_tree: roots.flatMap((root: any) => [[base.ids.get(root.value), root.count], ...root.children.map((child: any) => [base.ids.get(child.value), child.count])]),
      availability: current.availability,
    },
  }
}
