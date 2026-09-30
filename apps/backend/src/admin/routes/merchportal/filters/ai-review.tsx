import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Source = { supplier_name: string; source_value: string; target_value?: string; samples?: Array<{ id: string; name: string }> }
type Group = { id: number; target_value: string; reason: string; sources: Source[]; count: number; accepted: boolean }
type Review = { id: string; status: string; progress: string; error?: string; groups: Group[]; usage?: { input_tokens: number; output_tokens: number } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/admin/merchportal/facet-mappings/${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json" } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || "AI request failed")
  return result
}

export default function AiReview({ type, supplierId, reviews, onChange }: { type: string; supplierId: string; reviews: Array<{ id: string; status: string; facet_type: string }>; onChange: () => Promise<void> }) {
  const [configured, setConfigured] = useState(false)
  const [key, setKey] = useState("")
  const [review, setReview] = useState<Review>()
  const [selected, setSelected] = useState<number[]>([])
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { api<{ configured: boolean }>("ai-settings").then((result) => setConfigured(result.configured)).catch((error) => setError(error.message)) }, [])
  const open = async (id: string) => {
    const result = await api<{ review: Review }>(`reviews/${id}`)
    setReview(result.review)
    setSelected([])
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
    await onChange()
  })
  const accept = () => run(async () => {
    if (!review) return
    const result = await api<{ review: Review }>(`reviews/${review.id}`, { method: "POST", body: JSON.stringify({ groups: selected.map((id) => ({ id, target_value: targets[id] ?? review.groups.find((group) => group.id === id)!.target_value })) }) })
    setReview(result.review)
    setSelected([])
    await onChange()
    toast.success("Approved filter groups applied")
  })
  return <Container>
    <Heading level="h2">AI filter cleanup</Heading>
    <Text className="my-2 text-ui-fg-subtle">GPT-6.1 Sol · Medium reasoning. Reviews the selected filter type and supplier, including existing mappings. Only supplier labels and example product names are sent to OpenAI. API usage is billed to your OpenAI account. Invalid or truncated batches retry up to twice with fewer values; completed proposals stay saved. Review and edit proposed names before approving.</Text>
    <div className="mb-3 flex flex-wrap gap-2"><Input className="max-w-md" type="password" autoComplete="off" aria-label="OpenAI API key" placeholder={configured ? "Replace saved OpenAI API key" : "OpenAI API key"} value={key} onChange={(event) => setKey(event.target.value)} /><Button variant="secondary" disabled={busy || !key.trim()} onClick={() => run(async () => { const result = await api<{ configured: boolean }>("ai-settings", { method: "POST", body: JSON.stringify({ api_key: key }) }); setConfigured(result.configured); setKey(""); toast.success("OpenAI key saved securely") })}>Save key</Button><Button disabled={busy || !configured || review?.status === "running"} onClick={start}>Generate proposals</Button></div>
    <div className="mb-3 flex flex-wrap gap-2">{reviews.map((item) => <Button key={item.id} size="small" variant="secondary" disabled={busy} onClick={() => run(() => open(item.id))}>Open {item.facet_type} review · {item.status}</Button>)}</div>
    {error && <Text className="text-ui-fg-error" role="alert">{error}</Text>}
    {review?.status === "running" && <div className="flex items-center gap-3"><Text>Reviewing supplier values · {review.progress}. You can return to this saved review later.</Text><Button variant="secondary" size="small" disabled={busy} onClick={() => run(async () => { await api(`reviews/${review.id}`, { method: "DELETE" }); setReview(undefined); await onChange() })}>Stop review</Button></div>}
    {review?.error && <Text className="text-ui-fg-error">{review.error}</Text>}
    {review?.status === "failed" && <div className="my-3 flex items-center gap-3"><Text>Completed proposals are saved · {review.progress}</Text><Button variant="secondary" disabled={busy} onClick={() => run(async () => { const result = await api<{ review: Review }>(`reviews/${review.id}`, { method: "POST", body: JSON.stringify({ resume: true }) }); setReview(result.review); await onChange() })}>Resume unfinished values</Button></div>}
    {review?.status === "ready" && <>
      <div className="my-3 flex flex-wrap items-center gap-2"><Text>{review.groups.length} proposed filters · {review.progress} values reviewed</Text><Button size="small" variant="secondary" onClick={() => setSelected(review.groups.filter((group) => !group.accepted).map((group) => group.id))}>Select all proposals</Button><Button size="small" variant="secondary" onClick={() => setSelected([])}>Clear selection</Button><Button disabled={busy || !selected.length} onClick={accept}>Approve {selected.length} groups</Button></div>
      <div className="max-h-[60vh] overflow-y-auto space-y-3">{review.groups.map((group) => <div key={group.id} className="rounded border p-3"><div className="flex items-center gap-3"><input type="checkbox" aria-label={`Approve ${group.target_value}`} disabled={group.accepted || busy} checked={selected.includes(group.id)} onChange={() => setSelected((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} /><Input className="max-w-md" disabled={group.accepted} aria-label="Proposed filter name" maxLength={80} value={targets[group.id] ?? group.target_value} onChange={(event) => setTargets((current) => ({ ...current, [group.id]: event.target.value }))} /><Text>{group.sources.length} values · {group.count} product memberships{group.accepted ? " · Applied" : ""}</Text></div><Text className="my-2 text-ui-fg-subtle">{group.reason}</Text><details><summary className="cursor-pointer">Review values and example products</summary>{group.sources.map((source, index) => <div className="border-t py-2 text-sm" key={index}>{source.source_value} · {source.supplier_name}{source.target_value ? ` · currently → ${source.target_value}` : ""}<div>{source.samples?.map((sample) => <a className="mr-3 text-ui-fg-interactive" href={`/app/products/${sample.id}`} target="_blank" rel="noreferrer" key={sample.id}>{sample.name} ↗</a>)}</div></div>)}</details></div>)}</div>
      {review.usage && <Text className="mt-2 text-ui-fg-subtle">API tokens: {review.usage.input_tokens.toLocaleString()} input · {review.usage.output_tokens.toLocaleString()} output</Text>}
    </>}
  </Container>
}
