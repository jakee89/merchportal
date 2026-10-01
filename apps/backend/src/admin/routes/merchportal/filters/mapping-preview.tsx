import { Button, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

export type MappingDraft = { target_value: string | null; sources: Array<{ supplier_id: string; source_value: string }> }
type Preview = { source_labels: number; before_filters: number; after_filters: number; selected_labels: number; affected_products: number; products: Array<{ id: string; name: string }>; warnings: string[]; blocked: string[] }

export default function MappingPreview({ type, groups, busy, onApprove, onCancel }: { type: string; groups: MappingDraft[]; busy: boolean; onApprove: () => void; onCancel: () => void }) {
  const [result, setResult] = useState<Preview>()
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined)
    setError("")
    fetch("/admin/merchportal/facet-mappings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ action: "preview", facet_type: type, groups }) }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Preview failed")
      if (!controller.signal.aborted) setResult(body.preview)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [type, groups])
  return <div className="my-3 rounded border p-4"><Heading level="h2">Before / after approval</Heading>
    {!result && !error && <Text role="status">Checking affected products and saved structures…</Text>}
    {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
    {result && <><Text className="my-2" weight="plus">{result.source_labels.toLocaleString()} supplier labels → {result.after_filters.toLocaleString()} customer filters</Text><Text>{result.before_filters} filters before → {result.after_filters} after · {result.selected_labels} selected labels · {result.affected_products.toLocaleString()} affected products</Text>
      <div className="my-2 flex flex-wrap gap-2">{groups.map((group, index) => <span className="rounded border px-2 py-1 text-sm" key={index}>{group.sources.length} values → {group.target_value || "Original supplier labels"}</span>)}</div>
      {result.warnings.map((warning) => <Text key={warning} className="my-2 text-ui-fg-subtle">Review: {warning}</Text>)}
      {result.blocked.map((warning) => <Text role="alert" key={warning} className="text-ui-fg-error">{warning}</Text>)}
      <details className="my-3"><summary>Example affected products</summary>{result.products.map((product) => <a className="my-1 block text-ui-fg-interactive" key={product.id} href={`/app/products/${product.id}`} target="_blank" rel="noreferrer">{product.name} ↗</a>)}</details></>}
    <div className="flex gap-2"><Button isLoading={busy} disabled={!result || result.blocked.length > 0 || busy} onClick={onApprove}>Approve changes</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </div>
}
