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

type Organization = {
  id: string
  name: string
  join_code: string
  status: string
}
type PricingRule = {
  id: string
  scope_key: string
  organization_id?: string
  markup_percentage: number
}
type Job = {
  id: string
  supplier_name: string
  supplier_code: string
  kind: string
  trigger: string
  status: string
  phase: string
  current_message?: string
  total_records: number
  progress_percent: number
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
  try {
    body = text ? JSON.parse(text) : {}
  } catch {}
  if (!response.ok) {
    throw new Error(body.message || body.error || text || `Request failed (${response.status})`)
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
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [globalMarkup, setGlobalMarkup] = useState("30")
  const [clientMarkups, setClientMarkups] = useState<Record<string, string>>({})
  const [companyName, setCompanyName] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyLogo, setCompanyLogo] = useState("")
  const [publishableKey, setPublishableKey] = useState("")
  const [busy, setBusy] = useState("")

  const refresh = useCallback(async () => {
    const [supplierData, companyData, pricingData] = await Promise.all([api<{ suppliers: Supplier[]; jobs: Job[] }>("/admin/merchportal/suppliers"), api<{ organizations: Organization[] }>("/admin/merchportal/organizations"), api<{ rules: PricingRule[] }>("/admin/merchportal/pricing-rules")])
    setSuppliers(supplierData.suppliers)
    setJobs(supplierData.jobs)
    setOrganizations(companyData.organizations)
    setPricingRules(pricingData.rules)
    const globalRule = pricingData.rules.find((rule) => rule.scope_key === "global")
    if (globalRule) setGlobalMarkup(String(globalRule.markup_percentage))
    setClientMarkups(Object.fromEntries(pricingData.rules.filter((rule) => rule.organization_id).map((rule) => [rule.organization_id!, String(rule.markup_percentage)])))
  }, [])

  useEffect(() => {
    refresh().catch((error) => toast.error(error.message))
  }, [refresh])

  useEffect(() => {
    if (!jobs.some((job) => job.status === "running" || job.status === "queued")) return
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500)
    return () => window.clearInterval(timer)
  }, [jobs, refresh])

  const setup = async () => {
    setBusy("setup")
    try {
      const result = await api<{
        setup: { publishable_api_key: { token: string } }
      }>("/admin/merchportal/setup", { method: "POST" })
      setPublishableKey(result.setup.publishable_api_key.token)
      toast.success("Malta shop configured. The publishable key is shown below.")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
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
        const result = await api<{
          connection: { ok: boolean; message: string }
        }>(`/admin/merchportal/suppliers/${code}/connection`, {
          method: "POST",
        })
        result.connection.ok ? toast.success(result.connection.message) : toast.error(result.connection.message)
      } else {
        await api(`/admin/merchportal/suppliers/${code}/sync`, {
          method: "POST",
          body: JSON.stringify({ kind: action }),
        })
        toast.success(`${action} update started`)
      }
      setTimeout(() => refresh().catch(() => undefined), 1200)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
  }

  const createCompany = async () => {
    if (!companyName.trim()) return
    setBusy("company")
    try {
      const address = companyAddress.trim() ? { address_1: companyAddress.trim(), country_code: "mt" } : undefined
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
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
  }

  const saveMarkup = async (organizationId?: string) => {
    const value = organizationId ? clientMarkups[organizationId] : globalMarkup
    setBusy(`pricing-${organizationId || "global"}`)
    try {
      await api("/admin/merchportal/pricing-rules", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId || null,
          markup_percentage: Number(value),
        }),
      })
      toast.success("Pricing rule saved")
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex items-center justify-between">
        <div>
          <Heading>MerchPortal setup</Heading>
          <Text className="text-ui-fg-subtle">Malta commerce, clients and supplier updates</Text>
        </div>
        <Button onClick={setup} isLoading={busy === "setup"}>
          Configure Malta & EUR
        </Button>
      </Container>
      {publishableKey && (
        <Container>
          <Heading level="h2">Storefront publishable key</Heading>
          <Text className="mb-3 text-ui-fg-subtle">Paste this into Portainer as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.</Text>
          <div className="flex gap-2">
            <Input readOnly value={publishableKey} onFocus={(event) => event.currentTarget.select()} />
            <Button variant="secondary" onClick={copyKey}>
              Copy key
            </Button>
          </div>
        </Container>
      )}

      <Container>
        <Heading level="h2">Supplier updates</Heading>
        <Text className="mb-4 text-ui-fg-subtle">Stock runs hourly; prices and catalog run daily. Catalog updates automatically normalize and publish every product. Use these buttons whenever the NAS missed an update.</Text>
        <div className="flex flex-col gap-y-3">
          {suppliers.map((supplier) => (
            <div key={supplier.code} className="rounded border p-4">
              {(() => {
                const active = jobs.find((job) => job.supplier_code === supplier.code && (job.status === "running" || job.status === "queued"))
                return active ? (
                  <div className="mb-4 rounded bg-ui-bg-subtle p-3">
                    <div className="mb-2 flex justify-between gap-3">
                      <Text size="small" weight="plus">
                        {active.current_message || `Updating ${active.kind}`}
                      </Text>
                      <Text size="small">{active.progress_percent || 0}%</Text>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ui-bg-disabled">
                      <div
                        className="h-full rounded-full bg-ui-tag-blue-icon transition-all"
                        style={{
                          width: `${Math.max(2, Math.min(100, active.progress_percent || 0))}%`,
                        }}
                      />
                    </div>
                    <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                      Phase: {active.phase || "starting"}
                      {active.total_records ? ` · ${active.processed.toLocaleString()} of ${active.total_records.toLocaleString()} records` : ""}
                    </Text>
                  </div>
                ) : null
              })()}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <Text weight="plus">{supplier.display_name}</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {supplier.configured ? "API key configured" : "Add API key in Portainer"}
                  </Text>
                </div>
                <Button variant="secondary" size="small" onClick={() => supplierAction(supplier.code, "test")} isLoading={busy === `${supplier.code}-test`}>
                  Test connection
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["catalog", "price", "stock"] as const).map((kind) => (
                  <Button key={kind} size="small" variant={supplier.due[kind] ? "primary" : "secondary"} disabled={!supplier.configured || jobs.some((job) => job.supplier_code === supplier.code && job.kind === kind && (job.status === "running" || job.status === "queued"))} isLoading={busy === `${supplier.code}-${kind}`} onClick={() => supplierAction(supplier.code, kind)}>
                    Update {kind}
                  </Button>
                ))}
              </div>
              <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                Catalog: {date(supplier.product_sync_at)} · Prices: {date(supplier.price_sync_at)} · Stock: {date(supplier.stock_sync_at)}
              </Text>
              {supplier.last_error && (
                <Text size="small" className="mt-2 text-ui-fg-error">
                  {supplier.last_error}
                </Text>
              )}
            </div>
          ))}
        </div>
      </Container>

      <Container>
        <Heading level="h2">Client companies</Heading>
        <div className="my-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input placeholder="Company name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
          <Input placeholder="Address in Malta" value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} />
          <Input placeholder="Logo URL (optional)" value={companyLogo} onChange={(event) => setCompanyLogo(event.target.value)} />
          <Button onClick={createCompany} isLoading={busy === "company"}>
            Create company
          </Button>
        </div>
        <div className="flex flex-col gap-y-2">
          {organizations.map((organization) => (
            <div key={organization.id} className="flex items-center justify-between rounded border p-3">
              <Text weight="plus">{organization.name}</Text>
              <Text size="small">
                Client code: <strong>{organization.join_code}</strong>
              </Text>
            </div>
          ))}
        </div>
      </Container>

      <Container>
        <Heading level="h2">Catalog publishing</Heading>
        <Text className="text-ui-fg-subtle">Every supplier catalog update now normalizes and publishes all products automatically. Supplier categories are kept as the active categories. AI and manual category mapping will be added later as a separate tool.</Text>
      </Container>

      <Container>
        <Heading level="h2">Pricing rules</Heading>
        <Text className="mb-4 text-ui-fg-subtle">Supplier cost is private. Clients see cost plus their company markup, or the global markup when no client rule exists.</Text>
        <div className="mb-3 flex items-center gap-2">
          <Text weight="plus">Global markup %</Text>
          <Input type="number" min="0" max="1000" value={globalMarkup} onChange={(event) => setGlobalMarkup(event.target.value)} />
          <Button isLoading={busy === "pricing-global"} onClick={() => saveMarkup()}>
            Save
          </Button>
        </div>
        <div className="flex flex-col gap-y-2">
          {organizations.map((organization) => {
            const existing = pricingRules.find((rule) => rule.organization_id === organization.id)
            return (
              <div key={`price-${organization.id}`} className="flex items-center justify-between rounded border p-3">
                <div>
                  <Text weight="plus">{organization.name}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {existing ? "Custom client price" : `Uses global ${globalMarkup}% markup`}
                  </Text>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="1000"
                    placeholder={globalMarkup}
                    value={clientMarkups[organization.id] || ""}
                    onChange={(event) =>
                      setClientMarkups((current) => ({
                        ...current,
                        [organization.id]: event.target.value,
                      }))
                    }
                  />
                  <Button size="small" variant="secondary" disabled={!clientMarkups[organization.id]} isLoading={busy === `pricing-${organization.id}`} onClick={() => saveMarkup(organization.id)}>
                    Save client markup
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Container>

      <Container>
        <Heading level="h2">Recent imports</Heading>
        <div className="mt-3 flex flex-col gap-y-2">
          {jobs.slice(0, 16).map((job) => (
            <div key={job.id} className="border-b py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Text weight="plus">
                    {job.supplier_name} · {job.kind} · {job.status}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {job.trigger} update · {date(job.created_at)} · {job.current_message || job.phase}
                  </Text>
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  {job.processed || 0} processed · {job.created_count || 0} new · {job.updated_count || 0} changed · {job.skipped_count || 0} unchanged · {job.error_count || 0} errors
                </Text>
              </div>
              {(job.status === "running" || job.status === "queued") && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-ui-bg-disabled">
                  <div
                    className="h-full rounded-full bg-ui-tag-blue-icon transition-all"
                    style={{
                      width: `${Math.max(2, Math.min(100, job.progress_percent || 0))}%`,
                    }}
                  />
                </div>
              )}
              {job.error_message && (
                <div className="mt-2 rounded bg-ui-bg-component p-2">
                  <Text size="small" className="text-ui-fg-error">
                    Error: {job.error_message}
                  </Text>
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>

      {jobs.some((job) => job.status === "failed" || job.error_count > 0) && (
        <Container>
          <Heading level="h2">Import error log</Heading>
          <Text className="mb-3 text-ui-fg-subtle">Latest supplier failures, newest first.</Text>
          <div className="flex flex-col gap-y-2">
            {jobs
              .filter((job) => job.status === "failed" || job.error_count > 0)
              .map((job) => (
                <div key={`error-${job.id}`} className="rounded border border-ui-border-error p-3">
                  <Text weight="plus">
                    {job.supplier_name} · {job.kind} · {date(job.created_at)}
                  </Text>
                  <Text size="small" className="mt-1 text-ui-fg-error">
                    {job.error_message || `${job.error_count} record errors`}
                  </Text>
                </div>
              ))}
          </div>
        </Container>
      )}
    </div>
  )
}

export const config = defineRouteConfig({ label: "MerchPortal" })
export default MerchPortalPage
