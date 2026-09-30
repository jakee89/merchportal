import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import AiReview from "./ai-review"

type FacetType = "color" | "material" | "category" | "print_method"
type Option = { supplier_id: string; supplier_name: string; facet_type: FacetType; source_value: string; target_value?: string; count: number; new_since_import?: boolean; samples?: Array<{ id: string; name: string }> }
type Group = { target_value: string | null; sources: Array<{ supplier_id: string; source_value: string }> }
type Dashboard = { options: Option[]; suggestions: Array<Group & { count: number; facet_type: FacetType }>; changes: Array<{ id: string; facet_type: string; status: string; created_at: string; count: number }>; reviews: Array<{ id: string; status: string; facet_type: string }> }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`)
  return body
}

const FiltersPage = () => {
  const [options, setOptions] = useState<Option[]>([])
  const [type, setType] = useState<FacetType>("color")
  const [supplierId, setSupplierId] = useState("")
  const [search, setSearch] = useState("")
  const [hideMapped, setHideMapped] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState("")
  const [mapSearch, setMapSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [newOnly, setNewOnly] = useState(false)
  const [sort, setSort] = useState("count")
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [pending, setPending] = useState<Group[]>()
  const [rename, setRename] = useState("")
  const refresh = async () => { const result = await api<Dashboard>("/admin/merchportal/facet-mappings"); setDashboard(result); setOptions(result.options) }

  useEffect(() => { refresh().catch((error) => toast.error(error.message)) }, [])
  const suppliers = useMemo(() => [...new Map(options.map((item) => [item.supplier_id, item.supplier_name])).entries()], [options])
  const existingMaps = useMemo(() => [...new Set(options.filter((item) => item.facet_type === type && item.target_value).map((item) => item.target_value!))].sort((left, right) => left.localeCompare(right)), [options, type])
  const matchingMaps = existingMaps.filter((name) => name === target || name.toLocaleLowerCase().includes(mapSearch.toLocaleLowerCase()))
  const mapMembers = options.filter((item) => item.facet_type === type && item.target_value === target.trim())
  const visible = useMemo(() => options.filter((item) => item.facet_type === type && (!supplierId || item.supplier_id === supplierId) && (!hideMapped || !item.target_value) && (!newOnly || item.new_since_import) && item.source_value.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "count" ? b.count - a.count || a.source_value.localeCompare(b.source_value) : a.source_value.localeCompare(b.source_value)), [options, type, supplierId, search, hideMapped, newOnly, sort])
  const selectedOptions = options.filter((item) => selected.includes(`${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`))
  const selectShown = () => {
    const shown = visible.map((item) => `${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`).filter((id) => !selected.includes(id))
    setSelected((current) => [...current, ...shown])
  }
  const select = (item: Option) => {
    const id = `${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  const save = async () => {
    if (!target.trim() || !selectedOptions.length) return toast.error("Select values and enter a new name")
    setPending([{ target_value: target.trim(), sources: selectedOptions }])
  }
  const apply = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await api<Dashboard>("/admin/merchportal/facet-mappings", { method: "POST", body: JSON.stringify({ action: "groups", facet_type: type, groups: pending }) })
      setDashboard(result)
      setOptions(result.options)
      setSelected([])
      setPending(undefined)
      toast.success("Filter mapping saved")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!selectedOptions.length) return
    setPending([{ target_value: null, sources: selectedOptions }])
  }
  const undo = async (id: string) => {
    setBusy(true)
    try {
      const result = await api<Dashboard>("/admin/merchportal/facet-mappings", { method: "POST", body: JSON.stringify({ action: "undo", change_id: id }) })
      setDashboard(result)
      setOptions(result.options)
      setSelected([])
      toast.success("Mapping change undone")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }

  return <div className="flex flex-col gap-4">
    <Container><Heading level="h1">Filter mappings</Heading><Text className="mt-2 text-ui-fg-subtle">Combine supplier colour, material, category and print technology labels into shared customer-facing catalogue filters. New imports automatically use these mappings. Supplier data stays unchanged.</Text></Container>
    <Container>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">Filter type<select className="rounded-md border p-2" value={type} onChange={(event) => { setType(event.target.value as FacetType); setSelected([]); setPending(undefined); setTarget(""); setMapSearch("") }}><option value="color">Colours</option><option value="material">Materials</option><option value="category">Categories</option><option value="print_method">Print technologies</option></select></label>
        <label className="flex flex-col gap-1 text-sm">Supplier<select className="rounded-md border p-2" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setSelected([]) }}><option value="">All suppliers</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">Find value<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search values" /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={hideMapped} onChange={(event) => setHideMapped(event.target.checked)} />Hide mapped values</label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} />Unmapped since latest catalogue import</label>
        <label className="flex flex-col gap-1 text-sm">Sort<select className="rounded-md border p-2" value={sort} onChange={(event) => setSort(event.target.value)}><option value="count">Most products first</option><option value="name">Alphabetical</option></select></label>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">Find an existing map<Input value={mapSearch} onChange={(event) => setMapSearch(event.target.value)} placeholder="Search saved maps" /></label>
        <label className="flex flex-col gap-1 text-sm">Use existing map<select className="rounded-md border p-2" value={existingMaps.includes(target) ? target : ""} onChange={(event) => setTarget(event.target.value)}><option value="">Choose a saved map</option>{matchingMaps.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <Text className="text-ui-fg-subtle">{existingMaps.length.toLocaleString()} saved maps for this filter type</Text>
      </div>
      {mapMembers.length > 0 && <details className="mb-4 rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">{target} · {mapMembers.length} mapped supplier values</summary><div className="mt-2 flex flex-wrap gap-2">{mapMembers.map((item) => <span key={`${item.supplier_id}:${item.source_value}`} className="rounded-md border px-2 py-1">{item.source_value} · {item.supplier_name}</span>)}</div></details>}
      {mapMembers.length > 0 && <div className="mb-3 flex items-center gap-2"><Input className="max-w-xs" aria-label="Rename entire saved map" placeholder="New name for entire saved map" value={rename} onChange={(event) => setRename(event.target.value)} maxLength={80} /><Button variant="secondary" disabled={busy || !rename.trim()} onClick={() => setPending([{ target_value: rename.trim(), sources: mapMembers }])}>Preview rename of {mapMembers.length} values</Button></div>}
      <div className="mb-3 flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">New filter name<Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={type === "color" ? "e.g. Navy Blue" : type === "material" ? "e.g. Recycled cotton" : type === "category" ? "e.g. Backpacks" : "e.g. Digital transfer"} maxLength={80} /></label><Button isLoading={busy} disabled={!selected.length || !target.trim()} onClick={save}>Preview {selected.length} selected</Button><Button variant="secondary" isLoading={busy} disabled={!selected.length} onClick={remove}>Remove mapping</Button><Text className="text-ui-fg-subtle">Select matching values across suppliers, preview the change, then approve.</Text></div>
      {pending && <div className="my-3 rounded border p-4"><Heading level="h2">Review mapping changes</Heading>{pending.map((group, index) => <div key={index} className="my-2"><Text weight="plus">{group.sources.length} values → {group.target_value || "Original supplier labels"}</Text><details><summary>Show affected values and example products</summary>{group.sources.map((source) => { const option = options.find((item) => item.supplier_id === source.supplier_id && item.source_value === source.source_value && item.facet_type === type); return <div key={`${source.supplier_id}:${source.source_value}`} className="border-t py-2 text-sm">{source.source_value} · {option?.supplier_name} · currently {option?.target_value || "unmapped"}<div>{option?.samples?.map((sample) => <span key={sample.id} className="mr-3">{sample.name}</span>)}</div></div> })}</details></div>)}<div className="flex gap-2"><Button isLoading={busy} onClick={apply}>Approve changes</Button><Button variant="secondary" onClick={() => setPending(undefined)}>Cancel</Button></div></div>}
      <div className="mb-2 flex items-center gap-3"><Text className="text-ui-fg-subtle">{visible.length.toLocaleString()} values shown</Text><Button variant="secondary" size="small" disabled={busy || !visible.length} onClick={selectShown}>Select all shown</Button><Button variant="secondary" size="small" disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</Button></div>
      <div className="max-h-[65vh] overflow-y-auto rounded-md border">{visible.map((item) => { const id = `${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`; return <label key={id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(id)} onChange={() => select(item)} /><span className="min-w-40 flex-1">{item.source_value}</span><span className="text-ui-fg-subtle">{item.supplier_name}</span><span className="text-ui-fg-subtle">{item.count.toLocaleString()} products</span><span className="min-w-32 font-medium">{item.target_value ? `→ ${item.target_value}` : "Unmapped"}</span></label> })}</div>
    </Container>
    <AiReview type={type} supplierId={supplierId} reviews={dashboard?.reviews || []} onChange={refresh} />
    <Container><Heading level="h2">Suggested duplicate groups</Heading><Text className="my-2 text-ui-fg-subtle">Groups equivalent spelling, spacing and punctuation. Review before applying.</Text><div className="max-h-80 overflow-y-auto">{dashboard?.suggestions.filter((group) => group.facet_type === type).map((group, index) => <div key={index} className="flex items-center justify-between gap-3 border-b py-2"><Text>{group.target_value} · {group.sources.length} values · {group.count} product memberships</Text><Button size="small" variant="secondary" onClick={() => { setPending([group]); window.scrollTo({ top: 0, behavior: "smooth" }) }}>Preview group</Button></div>)}</div></Container>
    <Container><Heading level="h2">Recent mapping changes</Heading>{dashboard?.changes.map((change) => <div className="flex items-center justify-between border-b py-2" key={change.id}><Text>{change.facet_type} · {change.count} values · {new Date(change.created_at).toLocaleString()} · {change.status}</Text><Button size="small" variant="secondary" disabled={busy || change.status !== "applied"} onClick={() => undo(change.id)}>Undo</Button></div>)}</Container>
  </div>
}

export const config = defineRouteConfig({ label: "Filter mappings" })
export default FiltersPage
