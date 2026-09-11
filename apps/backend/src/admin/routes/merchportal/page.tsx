import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

type Supplier = {
  code: "stricker" | "midocean"
  display_name: string
  configured: boolean
  due: { catalog: boolean; price: boolean; stock: boolean }
  product_sync_at?: string
  price_sync_at?: string
  stock_sync_at?: string
  last_error?: string
}

type Organization = { id: string; name: string; join_code: string; status: string }
type CategoryMapping = { id: string; supplier_name: string; supplier_category: string; suggested_category: string; approved_category?: string; confidence: number; status: "pending" | "approved" | "ignored" }
type PricingRule = { id: string; scope_key: string; organization_id?: string; markup_percentage: number }
type NormalizedProduct = {
  source_key: string
  supplier_name: string
  title: string
  category?: string
  supplier_category: string
  category_status: string
  lead_time?: string
  sustainable: boolean
  print_methods: string[]
  images: string[]
  published: boolean
  variants: Array<{ sku: string; color: string; size: string; price_eur?: number; stock_quantity?: number }>
}
type Job = {
  id: string
  supplier_name: string
  supplier_code: string
  kind: string
  trigger: string
  status: string
  processed: number
  created_count: number
  updated_count: number
  skipped_count: number
  error_count: number
  created_at: string
  completed_at?: string
  error_message?: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  const text = await response.text()
  let body: any = {}
  try { body = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok) {
    throw new Error(
      body.message || body.error || text || `Request failed (${response.status})`
    )
  }
  return body
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString() : "Never"
}

const MerchPortalPage = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [catalog, setCatalog] = useState<NormalizedProduct[]>([])
  const [catalogOffset, setCatalogOffset] = useState(0)
  const [categoryMappings, setCategoryMappings] = useState<CategoryMapping[]>([])
  const [categoryChanges, setCategoryChanges] = useState<Record<string, string>>({})
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [globalMarkup, setGlobalMarkup] = useState("30")
  const [clientMarkups, setClientMarkups] = useState<Record<string, string>>({})
  const [companyName, setCompanyName] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyLogo, setCompanyLogo] = useState("")
  const [publishableKey, setPublishableKey] = useState("")
  const [busy, setBusy] = useState("")

  const refresh = useCallback(async () => {
    const mappingData = await api<{ mappings: CategoryMapping[] }>("/admin/merchportal/category-mappings")
    const [supplierData, companyData, catalogData, pricingData] = await Promise.all([
      api<{ suppliers: Supplier[]; jobs: Job[] }>("/admin/merchportal/suppliers"),
      api<{ organizations: Organization[] }>("/admin/merchportal/organizations"),
      api<{ products: NormalizedProduct[] }>(`/admin/merchportal/catalog?offset=${catalogOffset}`),
      api<{ rules: PricingRule[] }>("/admin/merchportal/pricing-rules"),
    ])
    setSuppliers(supplierData.suppliers)
    setJobs(supplierData.jobs)
    setOrganizations(companyData.organizations)
    setCatalog(catalogData.products)
    setCategoryMappings(mappingData.mappings)
    setPricingRules(pricingData.rules)
    const globalRule = pricingData.rules.find((rule) => rule.scope_key === "global")
    if (globalRule) setGlobalMarkup(String(globalRule.markup_percentage))
    setClientMarkups(Object.fromEntries(pricingData.rules.filter((rule) => rule.organization_id).map((rule) => [rule.organization_id!, String(rule.markup_percentage)])))
  }, [catalogOffset])

  useEffect(() => { refresh().catch((error) => toast.error(error.message)) }, [refresh])

  const setup = async () => {
    setBusy("setup")
    try {
      const result = await api<{ setup: { publishable_api_key: { token: string } } }>("/admin/merchportal/setup", { method: "POST" })
      setPublishableKey(result.setup.publishable_api_key.token)
      toast.success("Malta shop configured. The publishable key is shown below.")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const copyKey = async () => {
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publishableKey)
        copied = true
      }
    } catch {}
    if (!copied) {
      try {
        const input = document.createElement("textarea")
        input.value = publishableKey
        input.style.position = "fixed"
        input.style.opacity = "0"
        document.body.appendChild(input)
        input.select()
        copied = document.execCommand("copy")
        input.remove()
      } catch {}
    }
    copied ? toast.success("Publishable key copied") : toast.info("Select the key and copy it manually")
  }

  const supplierAction = async (code: string, action: string) => {
    const key = `${code}-${action}`
    setBusy(key)
    try {
      if (action === "test") {
        const result = await api<{ connection: { ok: boolean; message: string } }>(`/admin/merchportal/suppliers/${code}/connection`, { method: "POST" })
        result.connection.ok ? toast.success(result.connection.message) : toast.error(result.connection.message)
      } else {
        await api(`/admin/merchportal/suppliers/${code}/sync`, { method: "POST", body: JSON.stringify({ kind: action }) })
        toast.success(`${action} update started`)
      }
      setTimeout(() => refresh().catch(() => undefined), 1200)
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const createCompany = async () => {
    if (!companyName.trim()) return
    setBusy("company")
    try {
      const address = companyAddress.trim()
        ? { address_1: companyAddress.trim(), country_code: "mt" }
        : undefined
      await api("/admin/merchportal/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: companyName,
          logo_url: companyLogo || undefined,
          billing_address: address,
          shipping_address: address,
        }),
      })
      setCompanyName("")
      setCompanyAddress("")
      setCompanyLogo("")
      toast.success("Company created")
      await refresh()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const publishProducts = async (recordIds: string[]) => {
    setBusy("publish")
    try {
      const result = await api<{ created: number }>("/admin/merchportal/catalog", {
        method: "POST",
        body: JSON.stringify({ source_keys: recordIds }),
      })
      toast.success(`${result.created} products published to the Malta catalog`)
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
  }

  const categoryAction = async (mapping: CategoryMapping, action: "approve" | "ignore" | "change") => {
    setBusy(`category-${mapping.id}`)
    try {
      await api("/admin/merchportal/category-mappings", {
        method: "POST",
        body: JSON.stringify({ mapping_id: mapping.id, action, category: categoryChanges[mapping.id] }),
      })
      toast.success(action === "ignore" ? "Suggestion ignored" : "Category approved")
      await refresh()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const saveMarkup = async (organizationId?: string) => {
    const value = organizationId ? clientMarkups[organizationId] : globalMarkup
    setBusy(`pricing-${organizationId || "global"}`)
    try {
      await api("/admin/merchportal/pricing-rules", {
        method: "POST",
        body: JSON.stringify({ organization_id: organizationId || null, markup_percentage: Number(value) }),
      })
      toast.success("Pricing rule saved")
      await refresh()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  return <div className="flex flex-col gap-y-3">
    <Container className="flex items-center justify-between">
      <div><Heading>MerchPortal setup</Heading><Text className="text-ui-fg-subtle">Malta commerce, clients and supplier updates</Text></div>
      <Button onClick={setup} isLoading={busy === "setup"}>Configure Malta & EUR</Button>
    </Container>
    {publishableKey && <Container><Heading level="h2">Storefront publishable key</Heading><Text className="mb-3 text-ui-fg-subtle">Paste this into Portainer as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.</Text><div className="flex gap-2"><Input readOnly value={publishableKey} onFocus={(event) => event.currentTarget.select()} /><Button variant="secondary" onClick={copyKey}>Copy key</Button></div></Container>}

    <Container>
      <Heading level="h2">Supplier updates</Heading>
      <Text className="mb-4 text-ui-fg-subtle">Stock runs hourly; prices and catalog run daily. Use these buttons whenever the NAS missed an update.</Text>
      <div className="flex flex-col gap-y-3">
        {suppliers.map((supplier) => <div key={supplier.code} className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between"><div><Text weight="plus">{supplier.display_name}</Text><Text size="small" className="text-ui-fg-subtle">{supplier.configured ? "API key configured" : "Add API key in Portainer"}</Text></div><Button variant="secondary" size="small" onClick={() => supplierAction(supplier.code, "test")} isLoading={busy === `${supplier.code}-test`}>Test connection</Button></div>
          <div className="flex flex-wrap gap-2">
            {(["catalog", "price", "stock"] as const).map((kind) => <Button key={kind} size="small" variant={supplier.due[kind] ? "primary" : "secondary"} disabled={!supplier.configured} isLoading={busy === `${supplier.code}-${kind}`} onClick={() => supplierAction(supplier.code, kind)}>Update {kind}</Button>)}
          </div>
          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">Catalog: {date(supplier.product_sync_at)} · Prices: {date(supplier.price_sync_at)} · Stock: {date(supplier.stock_sync_at)}</Text>
          {supplier.last_error && <Text size="small" className="mt-2 text-ui-fg-error">{supplier.last_error}</Text>}
        </div>)}
      </div>
    </Container>

    <Container>
      <Heading level="h2">Client companies</Heading>
      <div className="my-4 grid grid-cols-1 gap-2 md:grid-cols-4"><Input placeholder="Company name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} /><Input placeholder="Address in Malta" value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} /><Input placeholder="Logo URL (optional)" value={companyLogo} onChange={(event) => setCompanyLogo(event.target.value)} /><Button onClick={createCompany} isLoading={busy === "company"}>Create company</Button></div>
      <div className="flex flex-col gap-y-2">{organizations.map((organization) => <div key={organization.id} className="flex items-center justify-between rounded border p-3"><Text weight="plus">{organization.name}</Text><Text size="small">Client code: <strong>{organization.join_code}</strong></Text></div>)}</div>
    </Container>

    <Container>
      <Heading level="h2">Supplier categories and mapping</Heading>
      <Text className="mb-4 text-ui-fg-subtle">Supplier categories are the active default and are created automatically. Keep the default, map it manually, or remove a previous mapping. AI suggestions can be added later as a separate optional step.</Text>
      <div className="flex flex-col gap-y-2">{categoryMappings.map((mapping) => <div key={mapping.id} className="rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><Text weight="plus">{mapping.supplier_name}: {mapping.supplier_category}</Text><Text size="small" className="text-ui-fg-subtle">Active category: {mapping.status === "approved" ? mapping.approved_category || mapping.suggested_category : mapping.supplier_category} · mapping {mapping.status}</Text></div><div className="flex flex-wrap gap-2"><Input placeholder="Map to another category" value={categoryChanges[mapping.id] || ""} onChange={(event) => setCategoryChanges((current) => ({ ...current, [mapping.id]: event.target.value }))} /><Button size="small" disabled={mapping.status === "approved"} isLoading={busy === `category-${mapping.id}`} onClick={() => categoryAction(mapping, "approve")}>Keep default</Button><Button size="small" variant="secondary" isLoading={busy === `category-${mapping.id}`} onClick={() => categoryAction(mapping, "change")}>Map manually</Button><Button size="small" variant="secondary" isLoading={busy === `category-${mapping.id}`} onClick={() => categoryAction(mapping, "ignore")}>Remove mapping</Button></div></div></div>)}</div>
    </Container>

    <Container>
      <Heading level="h2">Pricing rules</Heading>
      <Text className="mb-4 text-ui-fg-subtle">Supplier cost is private. Clients see cost plus their company markup, or the global markup when no client rule exists.</Text>
      <div className="mb-3 flex items-center gap-2"><Text weight="plus">Global markup %</Text><Input type="number" min="0" max="1000" value={globalMarkup} onChange={(event) => setGlobalMarkup(event.target.value)} /><Button isLoading={busy === "pricing-global"} onClick={() => saveMarkup()}>Save</Button></div>
      <div className="flex flex-col gap-y-2">{organizations.map((organization) => { const existing = pricingRules.find((rule) => rule.organization_id === organization.id); return <div key={`price-${organization.id}`} className="flex items-center justify-between rounded border p-3"><div><Text weight="plus">{organization.name}</Text><Text size="xsmall" className="text-ui-fg-subtle">{existing ? "Custom client price" : `Uses global ${globalMarkup}% markup`}</Text></div><div className="flex gap-2"><Input type="number" min="0" max="1000" placeholder={globalMarkup} value={clientMarkups[organization.id] || ""} onChange={(event) => setClientMarkups((current) => ({ ...current, [organization.id]: event.target.value }))} /><Button size="small" variant="secondary" disabled={!clientMarkups[organization.id]} isLoading={busy === `pricing-${organization.id}`} onClick={() => saveMarkup(organization.id)}>Save client markup</Button></div></div> })}</div>
    </Container>

    <Container>
      <div className="flex items-center justify-between gap-4"><div><Heading level="h2">Normalized product approval</Heading><Text className="text-ui-fg-subtle">Review the unified product, variant, colour, EUR price, stock and image data before publishing.</Text></div><Button disabled={!catalog.some((product) => !product.published)} isLoading={busy === "publish"} onClick={() => publishProducts(catalog.filter((product) => !product.published).slice(0, 10).map((product) => product.source_key))}>Publish next 10</Button></div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">{catalog.map((product) => <div key={product.source_key} className="flex gap-3 rounded border p-3">{product.images[0] ? <img src={product.images[0]} alt="" className="h-20 w-20 rounded object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded bg-ui-bg-component text-ui-fg-muted">No image</div>}<div className="min-w-0 flex-1"><Text weight="plus">{product.title}</Text><Text size="xsmall" className="text-ui-fg-subtle">{product.supplier_name} · {product.category || "Uncategorized"} · {product.variants.length} variants · mapping {product.category_status}</Text><Text size="xsmall" className="mt-1 text-ui-fg-subtle">{product.variants[0] ? `${product.variants[0].color} · ${product.variants[0].size} · supplier cost ${product.variants[0].price_eur !== undefined ? `EUR ${product.variants[0].price_eur.toFixed(2)}` : "unavailable"} · client from ${product.variants[0].price_eur !== undefined ? `EUR ${(product.variants[0].price_eur * (1 + Number(globalMarkup || 0) / 100)).toFixed(2)}` : "unavailable"} · ${product.variants[0].stock_quantity ?? 0} stock` : "No variants"}</Text><Text size="xsmall" className="mt-1 text-ui-fg-subtle">{product.sustainable ? "Sustainable · " : ""}{product.lead_time ? `Lead ${product.lead_time} · ` : ""}{product.print_methods.join(", ")}</Text><Button size="small" variant="secondary" className="mt-2" disabled={product.published || busy === "publish"} onClick={() => publishProducts([product.source_key])}>{product.published ? "Published" : "Approve & publish"}</Button></div></div>)}</div>
      <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={catalogOffset === 0} onClick={() => setCatalogOffset(Math.max(0, catalogOffset - 24))}>Previous</Button><Text size="small" className="text-ui-fg-subtle">Products {catalogOffset + 1}–{catalogOffset + catalog.length}</Text><Button variant="secondary" disabled={catalog.length < 24} onClick={() => setCatalogOffset(catalogOffset + 24)}>Next</Button></div>
    </Container>

    <Container>
      <Heading level="h2">Recent imports</Heading>
      <div className="mt-3 flex flex-col gap-y-2">{jobs.slice(0, 16).map((job) => <div key={job.id} className="border-b py-3"><div className="flex items-start justify-between gap-4"><div><Text weight="plus">{job.supplier_name} · {job.kind} · {job.status}</Text><Text size="xsmall" className="text-ui-fg-subtle">{job.trigger} update · {date(job.created_at)}</Text></div><Text size="small" className="text-ui-fg-subtle">{job.processed || 0} processed · {job.created_count || 0} new · {job.updated_count || 0} changed · {job.skipped_count || 0} unchanged · {job.error_count || 0} errors</Text></div>{job.error_message && <div className="mt-2 rounded bg-ui-bg-component p-2"><Text size="small" className="text-ui-fg-error">Error: {job.error_message}</Text></div>}</div>)}</div>
    </Container>

    {jobs.some((job) => job.status === "failed" || job.error_count > 0) && <Container><Heading level="h2">Import error log</Heading><Text className="mb-3 text-ui-fg-subtle">Latest supplier failures, newest first.</Text><div className="flex flex-col gap-y-2">{jobs.filter((job) => job.status === "failed" || job.error_count > 0).map((job) => <div key={`error-${job.id}`} className="rounded border border-ui-border-error p-3"><Text weight="plus">{job.supplier_name} · {job.kind} · {date(job.created_at)}</Text><Text size="small" className="mt-1 text-ui-fg-error">{job.error_message || `${job.error_count} record errors`}</Text></div>)}</div></Container>}
  </div>
}

export const config = defineRouteConfig({ label: "MerchPortal" })
export default MerchPortalPage
