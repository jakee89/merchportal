import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type FacetType = "color" | "material" | "category" | "print_method"
type Option = { supplier_id: string; supplier_name: string; facet_type: FacetType; source_value: string; target_value?: string; count: number }

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
  const [busy, setBusy] = useState(false)

  useEffect(() => { api<{ options: Option[] }>("/admin/merchportal/facet-mappings").then((result) => setOptions(result.options)).catch((error) => toast.error(error.message)) }, [])
  const suppliers = useMemo(() => [...new Map(options.map((item) => [item.supplier_id, item.supplier_name])).entries()], [options])
  const visible = useMemo(() => options.filter((item) => item.facet_type === type && (!supplierId || item.supplier_id === supplierId) && (!hideMapped || !item.target_value) && item.source_value.toLowerCase().includes(search.toLowerCase())), [options, type, supplierId, search, hideMapped])
  const selectedOptions = options.filter((item) => selected.includes(`${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`))
  const select = (item: Option) => {
    const id = `${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  const save = async () => {
    if (!target.trim() || !selectedOptions.length) return toast.error("Select values and enter a new name")
    setBusy(true)
    try {
      const result = await api<{ options: Option[] }>("/admin/merchportal/facet-mappings", { method: "POST", body: JSON.stringify({ facet_type: type, sources: selectedOptions.map((item) => ({ supplier_id: item.supplier_id, source_value: item.source_value })), target_value: target.trim() }) })
      setOptions(result.options)
      setSelected([])
      setTarget("")
      toast.success("Filter mapping saved")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!selectedOptions.length) return
    setBusy(true)
    try {
      const result = await api<{ options: Option[] }>("/admin/merchportal/facet-mappings", { method: "DELETE", body: JSON.stringify({ facet_type: type, sources: selectedOptions.map((item) => ({ supplier_id: item.supplier_id, source_value: item.source_value })) }) })
      setOptions(result.options)
      setSelected([])
      toast.success("Mappings removed")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }

  return <div className="flex flex-col gap-4">
    <Container><Heading level="h1">Filter mappings</Heading><Text className="mt-2 text-ui-fg-subtle">Combine supplier colour, material, category and print technology labels into shared customer-facing catalogue filters. New imports automatically use these mappings. Supplier data stays unchanged.</Text></Container>
    <Container>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">Filter type<select className="rounded-md border p-2" value={type} onChange={(event) => { setType(event.target.value as FacetType); setSelected([]) }}><option value="color">Colours</option><option value="material">Materials</option><option value="category">Categories</option><option value="print_method">Print technologies</option></select></label>
        <label className="flex flex-col gap-1 text-sm">Supplier<select className="rounded-md border p-2" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setSelected([]) }}><option value="">All suppliers</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">Find value<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search values" /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={hideMapped} onChange={(event) => setHideMapped(event.target.checked)} />Hide mapped values</label>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">New filter name<Input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={type === "color" ? "e.g. Navy Blue" : type === "material" ? "e.g. Recycled cotton" : type === "category" ? "e.g. Backpacks" : "e.g. Digital transfer"} maxLength={80} /></label><Button isLoading={busy} disabled={!selected.length || !target.trim()} onClick={save}>Map {selected.length} selected</Button><Button variant="secondary" isLoading={busy} disabled={!selected.length} onClick={remove}>Remove mapping</Button><Text className="text-ui-fg-subtle">Select up to 100 values across suppliers, then save one shared name. Uncheck “Hide mapped values” to edit or remove existing mappings.</Text></div>
      <Text className="mb-2 text-ui-fg-subtle">{visible.length.toLocaleString()} values shown</Text>
      <div className="max-h-[65vh] overflow-y-auto rounded-md border">{visible.map((item) => { const id = `${item.supplier_id}\u0000${item.facet_type}\u0000${item.source_value}`; return <label key={id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(id)} onChange={() => select(item)} /><span className="min-w-40 flex-1">{item.source_value}</span><span className="text-ui-fg-subtle">{item.supplier_name}</span><span className="text-ui-fg-subtle">{item.count.toLocaleString()} products</span><span className="min-w-32 font-medium">{item.target_value ? `→ ${item.target_value}` : "Unmapped"}</span></label> })}</div>
    </Container>
  </div>
}

export const config = defineRouteConfig({ label: "Filter mappings" })
export default FiltersPage
