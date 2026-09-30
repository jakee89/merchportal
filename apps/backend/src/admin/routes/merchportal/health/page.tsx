import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

const labels: Record<string, string> = { missing_prices: "Missing prices", missing_print_options: "No print options", missing_images: "No images supplied", failed_images: "Image requests failed", stale_stock: "Outdated stock" }
type Health = { summary: Record<string, number>; product_count: number; affected_count: number; page: number; pages: number; generated_at: string; suppliers: Array<{ id: string; name: string }>; products: Array<{ id: string; name: string; sku?: string; supplier: string; issues: string[]; stock_updated_at?: string }> }

const HealthPage = () => {
  const [data, setData] = useState<Health>()
  const [supplier, setSupplier] = useState("")
  const [issue, setIssue] = useState("")
  const [hours, setHours] = useState("48")
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const refresh = async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/admin/merchportal/health?${new URLSearchParams({ supplier_id: supplier, issue, stale_hours: hours, page: String(page) })}`, { credentials: "include" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Could not load catalogue health")
      setData(result)
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { refresh() }, [supplier, issue, hours, page])
  return <div className="space-y-4"><Container><Heading level="h1">Supplier data health</Heading><Text className="my-2 text-ui-fg-subtle">Find product options without prices, printing data, images or recent stock updates. No print options can be legitimate for an unprintable product. Image failures are observed through normal image requests; this does not scan or download the entire catalogue.</Text><div className="flex flex-wrap gap-3"><label>Supplier<select className="ml-2 rounded border p-2" value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1) }}><option value="">All suppliers</option>{data?.suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Stock older than<select className="ml-2 rounded border p-2" value={hours} onChange={(event) => { setHours(event.target.value); setPage(1) }}>{[24, 48, 72, 168].map((value) => <option key={value} value={value}>{value} hours</option>)}</select></label><Button variant="secondary" isLoading={busy} onClick={refresh}>Refresh</Button></div>{error && <Text className="mt-2 text-ui-fg-error" role="alert">{error}</Text>}</Container>
    {data && <><Container><Text>{data.product_count.toLocaleString()} products checked · {new Date(data.generated_at).toLocaleString()}</Text><div className="mt-3 grid gap-3 md:grid-cols-3">{Object.entries(labels).map(([key, label]) => <button type="button" className={`rounded border p-4 text-left ${issue === key ? "border-ui-border-interactive" : ""}`} onClick={() => { setIssue(issue === key ? "" : key); setPage(1) }} key={key}><Text weight="plus">{label}</Text><Text>{data.summary[key].toLocaleString()}</Text></button>)}</div></Container><Container><div className="mb-3 flex items-center justify-between"><Heading level="h2">{issue ? labels[issue] : "Products needing review"} · {data.affected_count.toLocaleString()}</Heading><Button size="small" variant="secondary" onClick={() => { setIssue(""); setPage(1) }}>Show all issues</Button></div>{data.products.map((product) => <div className="border-b py-3" key={product.id}><a className="text-ui-fg-interactive font-medium" href={`/app/products/${product.id}`}>{product.name} ↗</a><Text size="small">{product.supplier} · {product.sku || "No SKU"} · {product.issues.map((issue) => labels[issue]).join(" · ")}</Text>{product.issues.includes("stale_stock") && <Text size="small">Last stock update: {product.stock_updated_at ? new Date(product.stock_updated_at).toLocaleString() : "Never"}</Text>}</div>)}<div className="mt-3 flex items-center gap-3"><Button variant="secondary" size="small" disabled={busy || data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</Button><Text>Page {data.page} of {data.pages}</Text><Button variant="secondary" size="small" disabled={busy || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Next</Button></div><a href="/app/merchportal" className="mt-3 block text-ui-fg-interactive">Supplier updates →</a></Container></>}
  </div>
}

export const config = defineRouteConfig({ label: "Supplier data health" })
export default HealthPage
