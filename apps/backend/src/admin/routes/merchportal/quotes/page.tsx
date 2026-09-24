import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Quote = { id: string; organization_name: string; status: string; customer_note?: string; staff_note?: string; estimated_total: number | null; final_total?: number | null; submitted_at?: string; items: Array<{ id: string; product_name: string; color: string; quantity: number; estimated_total: number | null; quote_required: boolean; decorations: Array<{ method_name: string; position_name: string }> }> }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const text = await response.text()
  let body: any = {}
  try { body = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok) throw new Error(body.message || text || `Request failed (${response.status})`)
  return body
}

const QuotesPage = () => {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState("")
  const refresh = () => api<{ quotes: Quote[] }>("/admin/merchportal/quotes").then((result) => setQuotes(result.quotes))
  useEffect(() => { refresh().catch((error) => toast.error(error.message)) }, [])
  const respond = async (quote: Quote) => {
    setBusy(quote.id)
    try {
      await api(`/admin/merchportal/quotes/${quote.id}`, { method: "POST", body: JSON.stringify({ final_total: Number(prices[quote.id] ?? quote.final_total), note: notes[quote.id] ?? quote.staff_note ?? "" }) })
      toast.success("Final quote saved for the client")
      await refresh()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }
  return <div className="flex flex-col gap-y-3"><Container><Heading>Client quote requests</Heading><Text className="text-ui-fg-subtle">Review configured products and send a final EUR price. No order is placed automatically.</Text></Container>
    {quotes.length ? quotes.map((quote) => <Container key={quote.id}>
      <div className="flex items-start justify-between gap-4"><div><Heading level="h2">{quote.organization_name}</Heading><Text size="small" className="text-ui-fg-subtle">{quote.status} · {quote.submitted_at ? new Date(quote.submitted_at).toLocaleString() : ""} · {quote.items.length} products</Text></div><Text weight="plus">{quote.final_total !== null && quote.final_total !== undefined ? `Final €${quote.final_total.toFixed(2)}` : quote.estimated_total === null ? "Quote required" : `Estimate €${quote.estimated_total.toFixed(2)}`}</Text></div>
      {quote.customer_note && <Text className="mt-3">Client note: {quote.customer_note}</Text>}
      <div className="mt-3 flex flex-col gap-y-2">{quote.items.map((item) => <div className="rounded border p-3" key={item.id}><Text weight="plus">{item.product_name} · {item.color} · {item.quantity} units</Text><Text size="small">{item.quote_required || item.estimated_total === null ? "Supplier price unavailable — price manually" : `Estimate €${item.estimated_total.toFixed(2)}`}</Text>{item.decorations.map((line, index) => <Text size="small" key={index}>{line.method_name} · {line.position_name}</Text>)}</div>)}</div>
      <div className="mt-4 grid gap-2"><label className="text-sm">Final total in EUR<Input type="number" min="0" step="0.01" value={prices[quote.id] ?? (quote.final_total === null || quote.final_total === undefined ? "" : String(quote.final_total))} onChange={(event) => setPrices((current) => ({ ...current, [quote.id]: event.target.value }))} /></label><label className="text-sm">Message to client<textarea className="w-full rounded border p-2" maxLength={2000} value={notes[quote.id] ?? quote.staff_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [quote.id]: event.target.value }))} /></label><Button isLoading={busy === quote.id} disabled={!String(prices[quote.id] ?? quote.final_total ?? "").trim()} onClick={() => respond(quote)}>Send final quote</Button></div>
    </Container>) : <Container><Text>No quote requests yet.</Text></Container>}
  </div>
}

export const config = defineRouteConfig({ label: "Quote requests" })
export default QuotesPage
