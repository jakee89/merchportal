import { Button, Container, Heading, Input, Text } from "@medusajs/ui"
import { useState } from "react"
import { categoryBranchGroups, isProtectedTarget, type ProtectedFacet } from "../../../../modules/merchportal/facet-taxonomy-rules"
import type { FacetOption } from "../../../../modules/merchportal/facet-mappings"
import type { MappingDraft } from "./mapping-preview"

export default function CategoryTree({ options, protections, busy, onPreview, onProtect }: { options: FacetOption[]; protections: ProtectedFacet[]; busy: boolean; onPreview: (groups: MappingDraft[]) => void; onProtect: (value: string, locked: boolean) => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const destinations = [...new Set(options.filter((option) => option.facet_type === "category" && option.target_value).map((option) => option.target_value!))].sort()
  const roots = [...new Set(destinations.map((value) => value.split(">")[0].trim()))]
  const input = (value: string, branch: boolean) => {
    const locked = isProtectedTarget("category", value, protections)
    const ownLock = protections.some((item) => item.facet_type === "category" && item.target_value === value)
    return <div className="my-2 flex flex-wrap items-center gap-2"><Input className="max-w-md" aria-label={branch ? `Rename branch ${value}` : `Move or merge ${value}`} list={branch ? "category-parents" : "category-destinations"} maxLength={80} value={edits[value] ?? value} disabled={busy || locked} onChange={(event) => setEdits((current) => ({ ...current, [value]: event.target.value }))} />
      <Button size="small" variant="secondary" disabled={busy || locked || !edits[value]?.trim() || edits[value].trim() === value} onClick={() => onPreview(categoryBranchGroups(options, value, edits[value], branch))}>{branch ? "Preview branch rename / merge" : "Preview move / rename / merge"}</Button>
      <Button size="small" variant="secondary" disabled={busy || (locked && !ownLock)} onClick={() => onProtect(value, !ownLock)}>{ownLock ? "Unlock structure" : locked ? "Parent structure protected" : "Keep this structure"}</Button></div>
  }
  return <Container><Heading level="h2">Editable category tree</Heading><Text className="my-2 text-ui-fg-subtle">Expand a department. Rename or merge a whole branch, or edit a child’s full Parent &gt; Child path to move it. Choose an existing path to merge duplicates. All changes require preview and approval and can be undone.</Text>
    <datalist id="category-parents">{roots.map((value) => <option key={value} value={value} />)}</datalist><datalist id="category-destinations">{destinations.map((value) => <option key={value} value={value} />)}</datalist>
    {!roots.length && <Text>No approved category groups yet. Approve mappings below to build the tree.</Text>}
    {roots.map((root) => <details className="my-2 rounded border p-3" key={root}><summary className="cursor-pointer font-medium">{root} · {destinations.filter((value) => value.startsWith(`${root} > `)).length} children</summary>{input(root, true)}{destinations.filter((value) => value.startsWith(`${root} > `)).map((value) => <div className="ml-4 border-t py-2" key={value}><Text>{value}</Text>{input(value, false)}</div>)}</details>)}
  </Container>
}
