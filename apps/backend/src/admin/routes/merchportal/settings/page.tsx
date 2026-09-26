import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

type Tier = { min_quantity: number; max_quantity: number | null; markup_percentage: number }
type Rule = { scope_key: string; organization_id?: string; markup_percentage: number; quantity_tiers?: Tier[] | null }
type Supplier = { code: "stricker" | "midocean" | "aodaci" | "makito"; display_name: string; configured: boolean }
type Organization = { id: string; name: string }
type Email = { host: string; port: number; username: string; from_email: string; notification_email: string; password_configured: boolean; verified: boolean }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const text = await response.text()
  let body: any = {}
  try { body = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok) throw new Error(body.message || body.error || text || `Request failed (${response.status})`)
  return body
}

const SettingsPage = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [supplierKeys, setSupplierKeys] = useState<Record<string, string>>({})
  const [makitoId, setMakitoId] = useState("")
  const [supplierMarkups, setSupplierMarkups] = useState<Record<string, string>>({})
  const [tiers, setTiers] = useState<Record<string, Tier[]>>({})
  const [globalMarkup, setGlobalMarkup] = useState("30")
  const [clientMarkups, setClientMarkups] = useState<Record<string, string>>({})
  const [email, setEmail] = useState<Email>({ host: "smtppro.zoho.eu", port: 587, username: "", from_email: "", notification_email: "", password_configured: false, verified: false })
  const [emailPassword, setEmailPassword] = useState("")
  const [publishableKey, setPublishableKey] = useState("")
  const [busy, setBusy] = useState("")

  const refresh = useCallback(async () => {
    const [supplierData, pricingData, emailData] = await Promise.all([
      api<{ suppliers: Supplier[] }>("/admin/merchportal/suppliers"),
      api<{ rules: Rule[]; organizations: Organization[] }>("/admin/merchportal/pricing-rules"),
      api<{ email: Email }>("/admin/merchportal/email"),
    ])
    setSuppliers(supplierData.suppliers)
    setRules(pricingData.rules)
    setOrganizations(pricingData.organizations)
    setEmail(emailData.email)
    setGlobalMarkup(String(pricingData.rules.find((rule) => rule.scope_key === "global")?.markup_percentage ?? 30))
    setClientMarkups(Object.fromEntries(pricingData.rules.filter((rule) => rule.organization_id).map((rule) => [rule.organization_id!, String(rule.markup_percentage)])))
    setSupplierMarkups(Object.fromEntries(supplierData.suppliers.map((supplier) => [supplier.code, String(pricingData.rules.find((rule) => rule.scope_key === `supplier:${supplier.code}`)?.markup_percentage ?? pricingData.rules.find((rule) => rule.scope_key === "global")?.markup_percentage ?? 30)])))
    setTiers(Object.fromEntries(supplierData.suppliers.map((supplier) => [supplier.code, pricingData.rules.find((rule) => rule.scope_key === `supplier:${supplier.code}`)?.quantity_tiers || []])))
  }, [])

  useEffect(() => { refresh().catch((error) => toast.error(error.message)) }, [refresh])

  const saveKey = async (code: string) => {
    const apiKey = supplierKeys[code]?.trim()
    if (!apiKey) return
    setBusy(`key-${code}`)
    try {
      await api(`/admin/merchportal/suppliers/${code}/credential`, { method: "POST", body: JSON.stringify(code === "makito" ? { client_id: makitoId.trim(), client_secret: apiKey } : { api_key: apiKey }) })
      setSupplierKeys((current) => ({ ...current, [code]: "" }))
      if (code === "makito") setMakitoId("")
      await refresh()
      toast.success("Supplier credentials saved")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const testConnection = async (code: string) => {
    setBusy(`test-${code}`)
    try {
      const result = await api<{ connection: { ok: boolean; message: string } }>(`/admin/merchportal/suppliers/${code}/connection`, { method: "POST" })
      result.connection.ok ? toast.success(result.connection.message) : toast.error(result.connection.message)
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const saveRule = async (input: { supplier_code?: string; organization_id?: string; markup_percentage: number; quantity_tiers?: Tier[] }, key: string) => {
    setBusy(key)
    try {
      await api("/admin/merchportal/pricing-rules", { method: "POST", body: JSON.stringify(input) })
      toast.success("Pricing rule saved")
      await refresh()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const saveEmail = async () => {
    setBusy("email")
    try {
      const result = await api<{ email: Email }>("/admin/merchportal/email", { method: "POST", body: JSON.stringify({ ...email, app_password: emailPassword }) })
      setEmail(result.email)
      setEmailPassword("")
      toast.success("Email settings saved")
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const testEmail = async () => {
    setBusy("email-test")
    try {
      const result = await api<{ recipient: string }>("/admin/merchportal/email/verify", { method: "POST" })
      setEmail((current) => ({ ...current, verified: true }))
      toast.success(`Test email sent to ${result.recipient}`)
    } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
  }

  const updateTier = (code: string, index: number, update: Partial<Tier>) => setTiers((current) => ({ ...current, [code]: (current[code] || []).map((tier, tierIndex) => tierIndex === index ? { ...tier, ...update } : tier) }))
  const addTier = (code: string) => setTiers((current) => {
    const existing = current[code] || []
    const last = existing.at(-1)
    const min = last ? (last.max_quantity ?? last.min_quantity) + 1 : 1
    return { ...current, [code]: [...existing.slice(0, -1), ...(last ? [{ ...last, max_quantity: last.max_quantity ?? min - 1 }] : []), { min_quantity: min, max_quantity: null, markup_percentage: Number(supplierMarkups[code] || 30) }] }
  })

  return <div className="flex flex-col gap-y-3">
    <Container><Heading>Supplier API & settings</Heading><Text className="text-ui-fg-subtle">Connections, supplier-specific quantity markups and shop settings.</Text><a className="text-ui-fg-interactive text-sm" href="/app/merchportal">← Back to supplier updates</a></Container>
    <Container><Heading level="h2">Supplier connections and quantity markups</Heading><Text className="mb-4 text-ui-fg-subtle">Set tiers separately for each supplier. Quantities outside a tier use that supplier’s fallback markup. Client-specific markup, if set, takes priority over supplier tiers.</Text>
      <div className="flex flex-col gap-4">{suppliers.map((supplier) => {
        const code = supplier.code
        const rows = tiers[code] || []
        return <div key={code} className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between"><div><Text weight="plus">{supplier.display_name}</Text><Text size="small" className="text-ui-fg-subtle">{supplier.configured ? "Credentials configured" : "Credentials not configured"}</Text></div><Button variant="secondary" size="small" onClick={() => testConnection(code)} isLoading={busy === `test-${code}`}>Test connection</Button></div>
          <div className="mb-4 flex flex-wrap gap-2">{code === "makito" && <Input autoComplete="off" aria-label="Makito Client ID" placeholder="Makito Client ID" value={makitoId} onChange={(event) => setMakitoId(event.target.value)} />}<Input type="password" autoComplete="off" aria-label={code === "makito" ? "Makito Client Secret" : `${supplier.display_name} API key`} placeholder={code === "makito" ? "Makito Client Secret" : supplier.configured ? "Replace API key" : "Supplier API key"} value={supplierKeys[code] || ""} onChange={(event) => setSupplierKeys((current) => ({ ...current, [code]: event.target.value }))} /><Button variant="secondary" disabled={!supplierKeys[code]?.trim() || (code === "makito" && !makitoId.trim())} isLoading={busy === `key-${code}`} onClick={() => saveKey(code)}>Save {code === "makito" ? "credentials" : "key"}</Button></div>
          <label className="mb-3 flex max-w-xs flex-col gap-1 text-sm">Fallback markup %<Input type="number" min="0" max="1000" value={supplierMarkups[code] || ""} onChange={(event) => setSupplierMarkups((current) => ({ ...current, [code]: event.target.value }))} /></label>
          <Text weight="plus">Quantity tiers</Text>
          <div className="mt-2 flex flex-col gap-2">{rows.map((tier, index) => <div key={`${code}-${index}`} className="flex flex-wrap items-end gap-2 rounded bg-ui-bg-subtle p-2">
            <label className="flex flex-col gap-1 text-sm">Minimum<input className="rounded border p-2" type="number" min="1" step="1" value={tier.min_quantity} onChange={(event) => updateTier(code, index, { min_quantity: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-1 text-sm">Maximum (blank = no limit)<input className="rounded border p-2" type="number" min="1" step="1" value={tier.max_quantity ?? ""} onChange={(event) => updateTier(code, index, { max_quantity: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-1 text-sm">Markup %<input className="rounded border p-2" type="number" min="0" max="1000" step="0.01" value={tier.markup_percentage} onChange={(event) => updateTier(code, index, { markup_percentage: Number(event.target.value) })} /></label>
            <Button size="small" variant="secondary" onClick={() => setTiers((current) => ({ ...current, [code]: rows.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button>
          </div>)}</div>
          <div className="mt-3 flex gap-2"><Button variant="secondary" size="small" onClick={() => addTier(code)}>Add tier</Button><Button isLoading={busy === `rule-${code}`} onClick={() => saveRule({ supplier_code: code, markup_percentage: Number(supplierMarkups[code]), quantity_tiers: rows }, `rule-${code}`)}>Save {supplier.display_name} pricing</Button></div>
        </div>
      })}</div>
    </Container>
    <Container><Heading level="h2">Default and client markups</Heading><Text className="mb-3 text-ui-fg-subtle">The global rate applies only when no supplier or client rule exists. A client rate overrides its supplier’s tiers.</Text>
      <div className="mb-3 flex items-center gap-2"><Text weight="plus">Global markup %</Text><Input type="number" min="0" max="1000" value={globalMarkup} onChange={(event) => setGlobalMarkup(event.target.value)} /><Button isLoading={busy === "rule-global"} onClick={() => saveRule({ markup_percentage: Number(globalMarkup) }, "rule-global")}>Save</Button></div>
      <div className="flex flex-col gap-2">{organizations.map((organization) => <div key={organization.id} className="flex items-center justify-between gap-3 rounded border p-3"><div><Text weight="plus">{organization.name}</Text><Text size="xsmall" className="text-ui-fg-subtle">{rules.some((rule) => rule.organization_id === organization.id) ? "Client override active" : "Uses supplier pricing"}</Text></div><div className="flex gap-2"><Input type="number" min="0" max="1000" placeholder="Client markup %" value={clientMarkups[organization.id] || ""} onChange={(event) => setClientMarkups((current) => ({ ...current, [organization.id]: event.target.value }))} /><Button size="small" variant="secondary" disabled={!clientMarkups[organization.id]} isLoading={busy === `rule-${organization.id}`} onClick={() => saveRule({ organization_id: organization.id, markup_percentage: Number(clientMarkups[organization.id]) }, `rule-${organization.id}`)}>Save</Button></div></div>)}</div>
    </Container>
    <Container><Heading level="h2">Quote emails · Zoho EU</Heading><Text className="mb-3 text-ui-fg-subtle">The app password is encrypted on the server and never shown again. Status: {email.verified ? "Verified" : email.password_configured ? "Saved — send a test email" : "Not configured"}</Text>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(["host", "username", "from_email", "notification_email"] as const).map((field) => <label key={field} className="flex flex-col gap-1 text-sm">{field.replaceAll("_", " ")}<Input value={email[field]} onChange={(event) => setEmail((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<label className="flex flex-col gap-1 text-sm">SMTP port<Input type="number" value={email.port} onChange={(event) => setEmail((current) => ({ ...current, port: Number(event.target.value) }))} /></label><label className="flex flex-col gap-1 text-sm">Zoho app password<Input type="password" autoComplete="new-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} placeholder={email.password_configured ? "Leave blank to keep current" : "Enter app password"} /></label></div>
      <div className="mt-4 flex gap-2"><Button isLoading={busy === "email"} onClick={saveEmail}>Save email settings</Button><Button variant="secondary" disabled={!email.password_configured} isLoading={busy === "email-test"} onClick={testEmail}>Send test email</Button></div>
    </Container>
    <Container><Heading level="h2">Shop setup</Heading><Text className="mb-3 text-ui-fg-subtle">The existing Malta/EUR storefront is already configured. Use this only if you need to retrieve the publishable key again.</Text><Button variant="secondary" isLoading={busy === "setup"} onClick={async () => { setBusy("setup"); try { const result = await api<{ setup: { publishable_api_key: { token: string } } }>("/admin/merchportal/setup", { method: "POST" }); setPublishableKey(result.setup.publishable_api_key.token) } catch (error) { toast.error((error as Error).message) } finally { setBusy("") } }}>Configure Malta & EUR</Button>{publishableKey && <Input readOnly className="mt-3" value={publishableKey} onFocus={(event) => event.currentTarget.select()} />}</Container>
    <Container><Heading level="h2">Catalog reset</Heading><Text className="mb-3 text-ui-fg-subtle">Permanently deletes imported supplier products and records. Companies, pricing rules and shop settings are preserved.</Text><Button variant="danger" isLoading={busy === "reset"} onClick={async () => {
      const confirmation = window.prompt("Type RESET to permanently delete all imported supplier products and start again.")
      if (confirmation !== "RESET") return
      setBusy("reset")
      try {
        const result = await api<{ reset: { deleted_products: number } }>("/admin/merchportal/catalog/reset", { method: "POST", body: JSON.stringify({ confirmation }) })
        toast.success(`Catalog reset: ${result.reset.deleted_products} products removed`)
      } catch (error) { toast.error((error as Error).message) } finally { setBusy("") }
    }}>Reset supplier catalog</Button></Container>
  </div>
}

export const config = defineRouteConfig({ label: "Supplier API & settings" })
export default SettingsPage
