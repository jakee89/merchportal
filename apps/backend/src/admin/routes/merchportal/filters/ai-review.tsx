import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useRef, useState } from "react"
import { selectProposal } from "./proposal-selection"
import { categoryDraftParts, categoryDraftPath } from "./category-draft"
import MappingPreview from "./mapping-preview"
import { canonicalSuggestions } from "../../../../modules/merchportal/facet-taxonomy-rules"
import type { FacetOption } from "../../../../modules/merchportal/facet-mappings"

type Source = { supplier_id: string; supplier_name: string; source_value: string; target_value?: string; samples?: Array<{ id: string; name: string }> }
type Group = { id: number; target_value: string; reason: string; sources: Source[]; count: number; accepted: boolean; needs_attention?: boolean; protected?: boolean }
type Review = { id: string; facet_type: string; status: string; progress: string; error?: string; groups: Group[]; usage?: { input_tokens: number; output_tokens: number } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/admin/merchportal/facet-mappings/${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json" } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || "AI request failed")
  return result
}

export default function AiReview({ type, supplierId, reviews, options, onChange }: { type: string; supplierId: string; reviews: Array<{ id: string; status: string; facet_type: string }>; options: FacetOption[]; onChange: () => Promise<void> }) {
  const [configured, setConfigured] = useState(false)
  const [key, setKey] = useState("")
  const [review, setReview] = useState<Review>()
  const [selected, setSelected] = useState<number[]>([])
  const anchor = useRef<number | undefined>(undefined)
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [queue, setQueue] = useState("straightforward")
  const [bulkParent, setBulkParent] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const destinations = [...new Set(options.filter((option) => option.facet_type === review?.facet_type && option.target_value).map((option) => option.target_value!))].sort()
  const shown = (review?.groups || []).filter((group) => (queue === "all" || (queue === "attention" ? group.needs_attention : !group.needs_attention)) && [targets[group.id] ?? group.target_value, ...group.sources.flatMap((source) => [source.source_value, source.supplier_name])].some((value) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  const available = shown.filter((group) => !group.accepted).map((group) => group.id)
  const selectedShown = selected.filter((id) => available.includes(id))
  const previewGroups = useMemo(() => selected.filter((id) => shown.some((group) => group.id === id && !group.accepted)).map((id) => {
    const group = review?.groups.find((item) => item.id === id)
    return { target_value: targets[id] ?? group?.target_value ?? "", sources: group?.sources || [] }
  }), [selected, review, targets, search, queue])
  useEffect(() => { setSelected([]); anchor.current = undefined; setPreviewing(false) }, [search, queue, review?.id])
  useEffect(() => { setPreviewing(false) }, [targets, selected])
  useEffect(() => { api<{ configured: boolean }>("ai-settings").then((result) => setConfigured(result.configured)).catch((error) => setError(error.message)) }, [])
  const open = async (id: string) => {
    const result = await api<{ review: Review }>(`reviews/${id}`)
    setReview(result.review)
    setSelected([])
    anchor.current = undefined
    setTargets({})
    setError("")
  }
  useEffect(() => {
    if (review?.status !== "running") return
    const timer = setTimeout(() => api<{ review: Review }>(`reviews/${review.id}`).then((result) => { setReview(result.review); setError("") }).catch((error) => setError(`${error.message}. Reopen this review to retry.`)), 5000)
    return () => clearTimeout(timer)
  }, [review])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try { await action() } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  const start = () => run(async () => {
    const result = await api<{ review: Review }>("reviews", { method: "POST", body: JSON.stringify({ facet_type: type, supplier_id: supplierId || undefined }) })
    setReview(result.review)
    setTargets({})
    setSelected([])
    anchor.current = undefined
    await onChange()
  })
  const accept = () => run(async () => {
    if (!review) return
    const result = await api<{ review: Review }>(`reviews/${review.id}`, { method: "POST", body: JSON.stringify({ groups: selectedShown.map((id) => ({ id, target_value: targets[id] ?? review.groups.find((group) => group.id === id)!.target_value })) }) })
    setReview(result.review)
    setSelected([])
    anchor.current = undefined
    await onChange()
    toast.success("Approved filter groups applied")
  })
  const toggle = (id: number, shift: boolean) => {
    if (busy) return
    const previousAnchor = anchor.current
    setSelected((current) => selectProposal(current, available, id, previousAnchor, shift))
    anchor.current = id
  }
  const categoryGroups = review?.facet_type === "category" ? [...new Set(shown.map((group) => (targets[group.id] ?? group.target_value).split(">")[0].trim()))].sort() : []
  return <Container>
    <Heading level="h2">AI filter cleanup</Heading>
    <Text className="my-2 text-ui-fg-subtle">GPT-6.1 Sol · High reasoning. Groups shades into useful colour families, technical compositions into recognisable materials, and categories into parent departments and subcategories. Uses existing maps, catalogue-wide label context and example product names; no prices or client details are sent. API usage is billed to your OpenAI account. Completed batches stay saved if a retry is needed. Nothing changes until you approve; detailed supplier product specifications stay unchanged.</Text>
    <div className="mb-3 flex flex-wrap gap-2"><Input className="max-w-md" type="password" autoComplete="off" aria-label="OpenAI API key" placeholder={configured ? "Replace saved OpenAI API key" : "OpenAI API key"} value={key} onChange={(event) => setKey(event.target.value)} /><Button variant="secondary" disabled={busy || !key.trim()} onClick={() => run(async () => { const result = await api<{ configured: boolean }>("ai-settings", { method: "POST", body: JSON.stringify({ api_key: key }) }); setConfigured(result.configured); setKey(""); toast.success("OpenAI key saved securely") })}>Save key</Button><Button disabled={busy || !configured || review?.status === "running"} onClick={start}>Generate proposals</Button></div>
    <div className="mb-3 flex flex-wrap gap-2">{reviews.map((item) => <Button key={item.id} size="small" variant="secondary" disabled={busy} onClick={() => run(() => open(item.id))}>Open {item.facet_type} review · {item.status}</Button>)}</div>
    {error && <Text className="text-ui-fg-error" role="alert">{error}</Text>}
    {review?.status === "running" && <div className="flex items-center gap-3"><Text>Reviewing supplier values · {review.progress}. You can return to this saved review later.</Text><Button variant="secondary" size="small" disabled={busy} onClick={() => run(async () => { await api(`reviews/${review.id}`, { method: "DELETE" }); setReview(undefined); await onChange() })}>Stop review</Button></div>}
    {review?.error && <Text className="text-ui-fg-error">{review.error}</Text>}
    {review?.status === "failed" && <div className="my-3 flex items-center gap-3"><Text>Completed proposals are saved · {review.progress}</Text><Button variant="secondary" disabled={busy} onClick={() => run(async () => { const result = await api<{ review: Review }>(`reviews/${review.id}`, { method: "POST", body: JSON.stringify({ resume: true }) }); setReview(result.review); await onChange() })}>Resume unfinished values</Button></div>}
    {review?.status === "ready" && <>
      <div className="my-3 flex flex-wrap items-center gap-2"><Input className="max-w-md" aria-label="Search AI proposals" placeholder="Proposed name, supplier label or supplier" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Proposal queue" className="rounded border p-2" value={queue} onChange={(event) => setQueue(event.target.value)}><option value="straightforward">Straightforward proposals</option><option value="attention">Needs attention ({review.groups.filter((group) => group.needs_attention).length})</option><option value="all">All proposals</option></select><Text>{shown.length} of {review.groups.length} proposals · {selectedShown.length} selected</Text><Button size="small" variant="secondary" disabled={busy || !available.length} onClick={() => { setSelected(available); anchor.current = undefined }}>Select all shown</Button><Button size="small" variant="secondary" disabled={busy} onClick={() => { setSelected([]); anchor.current = undefined }}>Clear selection</Button><Button disabled={busy || !selectedShown.length} onClick={() => setPreviewing(true)}>Preview {selectedShown.length} groups</Button></div>
      {review.facet_type === "category" && <div className="my-3 flex flex-wrap items-center gap-2"><Input className="max-w-md" aria-label="Bulk parent department" list="ai-parents" value={bulkParent} onChange={(event) => setBulkParent(event.target.value)} placeholder="Assign selected to a parent department" maxLength={80} /><datalist id="ai-parents">{[...new Set(destinations.map((value) => value.split(">")[0].trim()))].map((value) => <option key={value} value={value} />)}</datalist><Button variant="secondary" disabled={busy || !bulkParent.trim() || bulkParent.includes(">") || !selectedShown.length} onClick={() => setTargets((current) => {
        const next = { ...current }
        for (const group of shown.filter((item) => selectedShown.includes(item.id) && !item.protected)) {
          const [, child] = categoryDraftParts(current[group.id] ?? group.target_value)
          next[group.id] = categoryDraftPath(bulkParent.trim(), child)
        }
        return next
      })}>Assign parent to selected (protected groups unchanged)</Button></div>}
      {previewing && <MappingPreview type={review.facet_type} groups={previewGroups} busy={busy} onApprove={accept} onCancel={() => setPreviewing(false)} />}
      <datalist id="ai-destinations">{destinations.map((value) => <option key={value} value={value} />)}</datalist>
      <Text className="mb-3 text-ui-fg-subtle">Click a checkbox or proposal text to select. Shift-click selects or clears a range. Applied proposals are excluded.</Text>
      {categoryGroups.length > 0 && <details className="mb-3 rounded border p-3" open><summary className="font-medium">Category tree preview · {categoryGroups.length} parent departments</summary>{categoryGroups.map((parent) => {
        const children = shown.filter((group) => (targets[group.id] ?? group.target_value).split(">")[0].trim() === parent)
        return <div className="mt-3" key={parent}><div className="flex items-center gap-2"><Text weight="plus">{parent || "Unnamed parent"}</Text><Button size="small" variant="secondary" disabled={busy || !children.some((group) => !group.accepted)} onClick={() => { setSelected((current) => [...new Set([...current, ...children.filter((group) => !group.accepted).map((group) => group.id)])]); anchor.current = undefined }}>Select department</Button></div><ul className="ml-5 list-disc text-sm">{children.map((group) => <li key={group.id}>{(targets[group.id] ?? group.target_value).split(">")[1]?.trim() || "All items in this department"} · {group.sources.length} source labels{group.accepted ? " · Applied" : ""}</li>)}</ul></div>
      })}</details>}
      <div className="max-h-[60vh] overflow-y-auto space-y-3">{shown.map((group) => {
        const [parent, child] = categoryDraftParts(targets[group.id] ?? group.target_value)
        const editCategory = (parent: string, child: string) => setTargets((current) => ({ ...current, [group.id]: categoryDraftPath(parent, child) }))
        const disabled = group.accepted || group.protected || busy
        return <div key={group.id} className={`rounded border p-3 ${selected.includes(group.id) ? "bg-ui-bg-highlight" : ""}`} onClick={(event) => { if (!(event.target as HTMLElement).closest("input, button, a, details, label, select")) toggle(group.id, event.shiftKey) }}>
          <div className="flex flex-wrap items-center gap-3"><input type="checkbox" aria-label={`Approve ${group.target_value}`} disabled={group.accepted || busy} checked={selected.includes(group.id)} onClick={(event) => toggle(group.id, event.shiftKey)} onChange={() => {}} />
            {review.facet_type === "category" ? <><label className="text-sm">Parent department (optional)<Input disabled={disabled} aria-label="Parent department" list="ai-parents" maxLength={80} value={parent} onChange={(event) => editCategory(event.target.value, child)} /></label><label className="text-sm">Subcategory / standalone department<Input disabled={disabled} aria-label="Subcategory" maxLength={80} value={child} onChange={(event) => editCategory(parent, event.target.value)} /></label></> : <Input className="max-w-md" disabled={disabled} list="ai-destinations" aria-label="Proposed filter name" maxLength={80} value={targets[group.id] ?? group.target_value} onChange={(event) => setTargets((current) => ({ ...current, [group.id]: event.target.value }))} />}
            <Text>{group.sources.length} values · {group.count} product memberships{group.accepted ? " · Applied" : ""}{group.protected ? " · Protected structure" : ""}{group.needs_attention ? " · Needs attention" : ""}</Text>
            <label className="text-sm">Reuse saved destination<select className="rounded border p-2" disabled={disabled} value="" onChange={(event) => { if (event.target.value) setTargets((current) => ({ ...current, [group.id]: event.target.value })) }}><option value="">Choose existing…</option>{destinations.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          {canonicalSuggestions(targets[group.id] ?? group.target_value, destinations).length > 0 && <div className="my-2 flex flex-wrap gap-2"><Text>Similar existing names:</Text>{canonicalSuggestions(targets[group.id] ?? group.target_value, destinations).map((value) => <Button size="small" variant="secondary" key={value} disabled={disabled} onClick={() => setTargets((current) => ({ ...current, [group.id]: value }))}>{value}</Button>)}</div>}
          <Text className="my-2 text-ui-fg-subtle">{group.reason}</Text><details><summary className="cursor-pointer">Review values and example products</summary>{group.sources.map((source, index) => <div className="border-t py-2 text-sm" key={index}>{source.source_value} · {source.supplier_name}{source.target_value ? ` · currently → ${source.target_value}` : ""}<div>{source.samples?.map((sample) => <a className="mr-3 text-ui-fg-interactive" href={`/app/products/${sample.id}`} target="_blank" rel="noreferrer" key={sample.id}>{sample.name} ↗</a>)}</div></div>)}</details>
        </div>
      })}</div>
      {review.usage && <Text className="mt-2 text-ui-fg-subtle">API tokens: {review.usage.input_tokens.toLocaleString()} input · {review.usage.output_tokens.toLocaleString()} output</Text>}
    </>}
  </Container>
}
