import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Address = { line1: string; line2?: string; city: string; postal_code: string; country_code: string }
type Quote = { id: string; organization_name: string; status: string; customer_note?: string; submitted_at?: string; contact_details?: { contact_name: string; contact_email: string; phone: string; company_name: string; vat_number: string; billing_address: Address; delivery_address: Address }; items: Array<{ id: string; product_name: string; sku?: string; color: string; variant_size?: string; variant_dimensions?: string; image_url?: string; quantity: number; artwork_filename?: string; artwork_url?: string; artwork_files?: Array<{ filename: string; url: string }>; decorations: Array<{ method_name: string; position_name: string; position_image_url?: string; print_width_mm?: number; print_height_mm?: number; max_width_mm?: number; max_height_mm?: number; print_colours?: number; print_stitches?: number }> }> }

function ArtworkLinks({ item }: { item: Quote["items"][number] }) {
  const files = item.artwork_files?.length ? item.artwork_files : item.artwork_url ? [{ filename: item.artwork_filename || "artwork", url: item.artwork_url }] : []
  return files.length ? <div className="mt-3"><Text weight="plus">Artwork files · {files.length}</Text>{files.map((file, index) => <a className="text-ui-fg-interactive mt-1 block text-sm font-medium" href={`/admin/merchportal/artwork/${encodeURIComponent(item.id)}?file=${index}`} key={index}>Download {file.filename} ↓</a>)}</div> : <Text size="small" className="text-ui-fg-subtle">No artwork attached</Text>
}

function mediaUrl(value?: string) {
  return value && /^\/media\/[A-Za-z0-9_.-]+$/.test(value) ? value : undefined
}

function address(value?: Address) {
  return value ? [value.line1, value.line2, value.city, value.postal_code, value.country_code?.toUpperCase()].filter(Boolean).join(", ") : "Not supplied"
}

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
  const refresh = () => api<{ quotes: Quote[] }>("/admin/merchportal/quotes").then((result) => setQuotes(result.quotes))
  useEffect(() => { refresh().catch((error) => toast.error(error.message)) }, [])
  return <div className="flex flex-col gap-y-3"><Container><Heading>Client quote requests</Heading><Text className="text-ui-fg-subtle">Full B2B contact, product, decoration and artwork details. Artwork downloads require a staff login.</Text></Container>
    {quotes.length ? quotes.map((quote) => <Container key={quote.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Heading level="h2">{quote.contact_details?.company_name || quote.organization_name}</Heading><Text size="small" className="text-ui-fg-subtle">Request {quote.id} · {quote.submitted_at ? new Date(quote.submitted_at).toLocaleString() : ""} · {quote.items.length} products</Text></div><span className="rounded-full bg-ui-bg-interactive px-3 py-1 text-sm text-ui-fg-on-color">{quote.status}</span></div>
      <div className="mt-4 grid gap-3 rounded-lg bg-ui-bg-subtle p-4 md:grid-cols-2"><div><Text weight="plus">Contact</Text><Text>{quote.contact_details?.contact_name || "Not supplied"}</Text><Text>{quote.contact_details?.contact_email || "Not supplied"}</Text><Text>{quote.contact_details?.phone || "Not supplied"}</Text><Text>VAT: {quote.contact_details?.vat_number || "Not supplied"}</Text></div><div><Text weight="plus">Billing address</Text><Text>{address(quote.contact_details?.billing_address)}</Text><Text weight="plus" className="mt-2">Delivery address</Text><Text>{address(quote.contact_details?.delivery_address)}</Text></div></div>
      {quote.customer_note && <div className="mt-3 rounded border p-3"><Text weight="plus">Client note</Text><Text>{quote.customer_note}</Text></div>}
      <div className="mt-4 flex flex-col gap-3">{quote.items.map((item) => <article className="rounded-lg border p-4" key={item.id}><div className="flex flex-wrap gap-4">{mediaUrl(item.image_url) && <img src={mediaUrl(item.image_url)} alt={item.product_name} className="h-28 w-28 rounded border bg-white object-contain" />}<div><Text weight="plus" className="text-lg">{item.product_name}</Text><Text>{item.color}{item.variant_size ? ` · ${item.variant_size}` : ""} · {item.quantity.toLocaleString()} units</Text><Text size="small" className="text-ui-fg-subtle">SKU {item.sku || "—"}{item.variant_dimensions ? ` · ${item.variant_dimensions}` : ""}</Text></div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{item.decorations.map((line, index) => <div className="flex gap-3 rounded border bg-ui-bg-subtle p-3" key={index}>{mediaUrl(line.position_image_url) && <img src={mediaUrl(line.position_image_url)} alt={`${line.position_name} print area`} className="h-20 w-20 rounded border bg-white object-contain" />}<div><Text weight="plus">{line.method_name}</Text><Text size="small">{line.position_name}</Text><Text size="small" className="text-ui-fg-subtle">{line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : line.max_width_mm && line.max_height_mm ? `Maximum ${line.max_width_mm} × ${line.max_height_mm} mm` : "Print size to confirm"}{line.print_colours ? ` · ${line.print_colours} colours` : ""}{line.print_stitches ? ` · ${line.print_stitches} stitches` : ""}</Text></div></div>)}</div><ArtworkLinks item={item} /></article>)}</div>
    </Container>) : <Container><Text>No quote requests yet.</Text></Container>}
  </div>
}

export const config = defineRouteConfig({ label: "Quote requests" })
export default QuotesPage
