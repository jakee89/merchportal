import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

type Supplier = {
  code: "stricker" | "midocean" | "aodaci" | "makito"
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
  started_at?: string
  updated_at?: string
  completed_at?: string
  cancel_requested_at?: string
  error_message?: string
  log?: {
    dry_run?: boolean
    events?: { at: string; phase: string; message: string }[]
  }
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

function duration(job?: Job) {
  if (!job) return ""
  const start = new Date(job.started_at || job.created_at).getTime()
  const end = new Date(job.completed_at || Date.now()).getTime()
  const milliseconds = end - start
  if (milliseconds < 60_000) return "Under a minute"
  return `${Math.round(milliseconds / 60_000)} min`
}

const MerchPortalPage = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [companyName, setCompanyName] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyLogo, setCompanyLogo] = useState("")
  const [busy, setBusy] = useState("")

  const refresh = useCallback(async () => {
    const [supplierData, companyData] = await Promise.all([api<{ suppliers: Supplier[]; jobs: Job[] }>("/admin/merchportal/suppliers"), api<{ organizations: Organization[] }>("/admin/merchportal/organizations")])
    setSuppliers(supplierData.suppliers)
    setJobs(supplierData.jobs)
    setOrganizations(companyData.organizations)
  }, [])

  useEffect(() => {
    refresh().catch((error) => toast.error(error.message))
  }, [refresh])

  useEffect(() => {
    if (!jobs.some((job) => job.status === "running" || job.status === "queued" || job.status === "cancelling")) return
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500)
    return () => window.clearInterval(timer)
  }, [jobs, refresh])

  const supplierAction = async (code: string, action: string, dryRun = false) => {
    const key = `${code}-${action}${dryRun ? "-preview" : ""}`
    setBusy(key)
    try {
      await api(`/admin/merchportal/suppliers/${code}/sync`, {
        method: "POST",
        body: JSON.stringify({ kind: action, dry_run: dryRun }),
      })
      toast.success(dryRun ? "Catalog preview started" : `${action} update started`)
      setTimeout(() => refresh().catch(() => undefined), 1200)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy("")
    }
  }

  const cancelJob = async (job: Job) => {
    setBusy(`cancel-${job.id}`)
    try {
      await api(`/admin/merchportal/import-jobs/${job.id}/cancel`, { method: "POST" })
      toast.success("Stop requested. The current database batch will finish safely.")
      await refresh()
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

  const activeJobs = jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "cancelling")
  const failedJobs = jobs.filter((job) => job.status === "failed" || job.error_count > 0)
  const latestCompleted = jobs.find((job) => job.status === "completed" && !job.log?.dry_run)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex items-center justify-between">
        <div>
          <Heading>MerchPortal setup</Heading>
          <Text className="text-ui-fg-subtle">Malta commerce, clients and supplier updates</Text>
          <div className="flex gap-4"><a className="text-ui-fg-interactive text-sm" href="/app/merchportal/quotes">Review quote requests →</a><a className="text-ui-fg-interactive text-sm" href="/app/merchportal/settings">Supplier API & settings →</a></div>
        </div>
      </Container>

      <Container>
        <Heading level="h2">Operations dashboard</Heading>
        <Text className="mb-4 text-ui-fg-subtle">Live supplier work, recent outcomes, and actions that need attention.</Text>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border p-3">
            <Text size="small" className="text-ui-fg-subtle">Active updates</Text>
            <Text weight="plus">{activeJobs.length ? `${activeJobs.length} active` : "None"}</Text>
            {activeJobs.slice(0, 2).map((job) => <Text key={job.id} size="xsmall">{job.supplier_name} · {job.kind} · {job.progress_percent}%</Text>)}
          </div>
          <div className="rounded border p-3">
            <Text size="small" className="text-ui-fg-subtle">Last successful update</Text>
            <Text weight="plus">{latestCompleted ? `${latestCompleted.supplier_name} · ${latestCompleted.kind}` : "No completed updates yet"}</Text>
            {latestCompleted && <Text size="xsmall">{date(latestCompleted.completed_at)} · {duration(latestCompleted)}</Text>}
          </div>
          <div className={`rounded border p-3 ${failedJobs.length ? "border-ui-border-error bg-ui-bg-error" : ""}`}>
            <Text size="small" className="text-ui-fg-subtle">Import alerts</Text>
            <Text weight="plus" className={failedJobs.length ? "text-ui-fg-error" : ""}>{failedJobs.length ? `${failedJobs.length} need attention` : "No import alerts"}</Text>
            {failedJobs[0] && <Text size="xsmall" className="text-ui-fg-error">{failedJobs[0].supplier_name} · {failedJobs[0].kind}</Text>}
          </div>
        </div>
      </Container>

      <Container>
        <Heading level="h2">Supplier updates</Heading>
        <Text className="mb-4 text-ui-fg-subtle">Stock runs hourly; prices and catalog run daily. Catalog updates automatically normalize and publish every product. Use these buttons whenever the NAS missed an update.</Text>
        <div className="flex flex-col gap-y-3">
          {suppliers.map((supplier) => (
            <div key={supplier.code} className="rounded border p-4">
              {(() => {
                const active = jobs.find((job) => job.supplier_code === supplier.code && (job.status === "running" || job.status === "queued" || job.status === "cancelling"))
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
                      {` · ${duration(active)}`}
                    </Text>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Text size="xsmall" className="text-ui-fg-subtle">Last update: {date(active.updated_at)}</Text>
                      <Button size="small" variant="secondary" isLoading={busy === `cancel-${active.id}`} disabled={active.status === "cancelling"} onClick={() => cancelJob(active)}>
                        {active.status === "cancelling" ? "Stopping…" : "Stop update"}
                      </Button>
                    </div>
                  </div>
                ) : null
              })()}
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <Text weight="plus">{supplier.display_name}</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {supplier.configured ? "API key configured" : "API key needed — open Supplier API & settings"}
                  </Text>
                </div>
                <a className="text-ui-fg-interactive text-sm" href="/app/merchportal/settings">Connection settings →</a>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["catalog", "price", "stock"] as const).map((kind) => (
                  <Button key={kind} size="small" variant={supplier.due[kind] ? "primary" : "secondary"} disabled={!supplier.configured || activeJobs.length > 0} isLoading={busy === `${supplier.code}-${kind}`} onClick={() => supplierAction(supplier.code, kind)}>
                    Update {kind}
                  </Button>
                ))}
                <Button size="small" variant="secondary" disabled={!supplier.configured || activeJobs.length > 0} isLoading={busy === `${supplier.code}-catalog-preview`} onClick={() => supplierAction(supplier.code, "catalog", true)}>
                  Preview catalog changes
                </Button>
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
        <Heading level="h2">Recent imports</Heading>
        <div className="mt-3 flex flex-col gap-y-2">
          {jobs.slice(0, 16).map((job) => (
            <div key={job.id} className="border-b py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Text weight="plus">
                    {job.supplier_name} · {job.kind} · {job.log?.dry_run ? "preview" : job.status}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                  {job.trigger} update · {date(job.created_at)} · {job.current_message || job.phase}
                  {job.completed_at ? ` · ${duration(job)}` : ""}
                  </Text>
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  {job.processed || 0} processed · {job.created_count || 0} new · {job.updated_count || 0} changed · {job.skipped_count || 0} unchanged · {job.error_count || 0} errors
                </Text>
              </div>
              {(job.status === "running" || job.status === "queued" || job.status === "cancelling") && (
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
                  <div className="flex items-center justify-between gap-3">
                    <Text size="small" className="text-ui-fg-error">Error details</Text>
                    <a className="text-ui-fg-interactive text-sm font-medium" href={`/admin/merchportal/import-jobs/${job.id}/log`} download>
                      Download full log
                    </a>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-ui-fg-error">{job.error_message}</pre>
                </div>
              )}
              {job.log?.events?.length ? (
                <details className="mt-2 rounded bg-ui-bg-component p-2">
                  <summary className="cursor-pointer text-sm font-medium">Activity log ({job.log.events.length})</summary>
                  <div className="mt-2 flex flex-col gap-y-1">
                    {[...job.log.events].reverse().map((event, index) => (
                      <Text key={`${event.at}-${index}`} size="xsmall">
                        {date(event.at)} · {event.phase} · {event.message}
                      </Text>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </Container>

      {jobs.some((job) => job.status === "failed" || job.error_count > 0) && (
        <Container>
          <Heading level="h2">Import error log</Heading>
          <Text className="mb-3 text-ui-fg-subtle">Latest supplier failures, newest first.</Text>
          <div className="flex flex-col gap-y-2">
          {failedJobs
              .map((job) => (
                <div key={`error-${job.id}`} className="rounded border border-ui-border-error p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Text weight="plus">
                      {job.supplier_name} · {job.kind} · {date(job.created_at)}
                    </Text>
                    <Button size="small" variant="secondary" isLoading={busy === `${job.supplier_code}-${job.kind}`} onClick={() => supplierAction(job.supplier_code, job.kind)}>
                      Retry
                    </Button>
                  </div>
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
