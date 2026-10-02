import type { Facets } from "./catalog-filters"

export type FacetSchema = { id: string; labels: string[]; fields: Record<string, number[]>; tree: [number, number[]][] }

export function decodeFacets(result: any, previous?: FacetSchema): { facets: Facets; schema?: FacetSchema } {
  if (result.facets) return { facets: result.facets, schema: previous }
  const schema: FacetSchema | undefined = result.schema || previous
  if (!schema || result.schema_id !== schema.id || !result.counts) throw new Error("Filter data changed. Please retry.")
  const label = (id: number) => {
    if (!Number.isInteger(id) || typeof schema.labels[id] !== "string") throw new Error("Invalid filter data")
    return schema.labels[id]
  }
  const facets: any = { availability: result.counts.availability }
  for (const field of Object.keys(schema.fields)) facets[field] = result.counts[field].map(([id, count]: [number, number]) => [label(id), count])
  const treeCounts = new Map<number, number>(result.counts.category_tree)
  facets.category_tree = { roots: schema.tree.filter(([id]) => treeCounts.has(id)).map(([id, children]) => ({ value: label(id), count: treeCounts.get(id)!, children: children.filter((child) => treeCounts.has(child)).map((child) => ({ value: label(child), label: label(child).split(" > ").slice(1).join(" > "), count: treeCounts.get(child)! })) })) }
  return { facets, schema }
}
