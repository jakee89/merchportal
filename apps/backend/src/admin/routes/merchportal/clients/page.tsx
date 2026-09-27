import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Address = { line1: string; line2: string; city: string; postal_code: string; country_code: string }
type Form = { first_name: string; last_name: string; contact_email: string; phone: string; company_name: string; vat_number: string; organization_id: string; billing_address: Address; delivery_address: Address }
type Client = { id: string; name: string; email: string; phone: string; company_name: string; vat_number: string; billing_address: Address | null; delivery_address: Address | null; organization_name: string; role: string; status: string; created_at: string; quote_count: number; last_quote_at: string | null; configuration_count: number; last_configuration_at: string | null }
const blankAddress = (): Address => ({ line1: "", line2: "", city: "", postal_code: "", country_code: "mt" })
const blankForm = (): Form => ({ first_name: "", last_name: "", contact_email: "", phone: "", company_name: "", vat_number: "", organization_id: "", billing_address: blankAddress(), delivery_address: blankAddress() })
const countryNames = new Intl.DisplayNames(["en"], { type: "region" })
const countries = Array.from({ length: 26 * 26 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26))
  .map((code) => ({ code: code.toLowerCase(), name: countryNames.of(code) || code }))
  .filter(({ code, name }) => name.toUpperCase() !== code.toUpperCase() && name !== "Unknown Region")
  .sort((left, right) => left.name.localeCompare(right.name))
const countryByCode = new Map(countries.map((country) => [country.code, country.name]))
const addressText = (address: Address | null) => address ? [address.line1 || (address as any).address_1, address.line2, address.city, address.postal_code, countryByCode.get(address.country_code) || address.country_code].filter(Boolean).join(", ") : "Not provided"
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Never"

const ClientsPage = () => {
  const [form, setForm] = useState<Form>(blankForm)
  const [sameDelivery, setSameDelivery] = useState(true)
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientCount, setClientCount] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState("")
  const [confirmEmail, setConfirmEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const change = (key: keyof Omit<Form, "billing_address" | "delivery_address">, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const changeAddress = (kind: "billing_address" | "delivery_address", key: keyof Address, value: string) => setForm((current) => ({ ...current, [kind]: { ...current[kind], [key]: value } }))

  const loadClients = async (offset = 0) => {
    const response = await fetch(`/admin/merchportal/clients?offset=${offset}&limit=25`, { credentials: "include" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || "Could not load clients")
    setClients((current) => offset ? [...current, ...body.clients] : body.clients)
    setClientCount(body.count)
  }
  useEffect(() => {
    fetch("/admin/merchportal/organizations", { credentials: "include" }).then((response) => response.json()).then((body) => setOrganizations(body.organizations || [])).catch(() => toast.error("Could not load client companies"))
    loadClients().catch((error) => toast.error(error.message))
  }, [])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch("/admin/merchportal/clients", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, contact_name: `${form.first_name} ${form.last_name}`.trim(), delivery_address: sameDelivery ? form.billing_address : form.delivery_address, organization_id: form.organization_id || undefined }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Could not create client")
      if (body.email_sent) toast.success("Client account created and invitation emailed")
      else toast.error("Client account created, but the email could not be sent. Check the Zoho sender and ask the client to use Forgot password.")
      setForm(blankForm())
      setSameDelivery(true)
      await loadClients()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const addressFields = (kind: "billing_address" | "delivery_address") => <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <label className="flex flex-col gap-1 text-sm">Street address<Input required maxLength={160} value={form[kind].line1} onChange={(event) => changeAddress(kind, "line1", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Address line 2 (optional)<Input maxLength={160} value={form[kind].line2} onChange={(event) => changeAddress(kind, "line2", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">City<Input required maxLength={100} value={form[kind].city} onChange={(event) => changeAddress(kind, "city", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Postal code<Input required maxLength={24} value={form[kind].postal_code} onChange={(event) => changeAddress(kind, "postal_code", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Country<select className="rounded-md border p-2" value={form[kind].country_code} onChange={(event) => changeAddress(kind, "country_code", event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
  </div>

  const deleteClient = async (client: Client) => {
    if (confirmEmail.trim().toLowerCase() !== client.email.toLowerCase()) return
    setBusy(true)
    try {
      const response = await fetch(`/admin/merchportal/clients/${encodeURIComponent(client.id)}`, { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm_email: confirmEmail }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Could not delete account")
      toast.success("Client login deleted. Quote history was retained.")
      setDeleteTarget("")
      setConfirmEmail("")
      await loadClients()
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }

  return <div className="flex flex-col gap-4"><Container><Heading level="h1">Clients</Heading><Text className="mt-2 text-ui-fg-subtle">Manage client accounts and review quote activity. Login counts are not tracked; the figures below come from saved configurations and submitted quotes.</Text></Container><Container>
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3"><div className="rounded border p-4"><Text size="small" className="text-ui-fg-subtle">Client accounts</Text><Heading level="h2">{clientCount}</Heading></div><div className="rounded border p-4"><Text size="small" className="text-ui-fg-subtle">Submitted quotes · loaded clients</Text><Heading level="h2">{clients.reduce((sum, client) => sum + client.quote_count, 0)}</Heading></div><div className="rounded border p-4"><Text size="small" className="text-ui-fg-subtle">Saved configurations · loaded clients</Text><Heading level="h2">{clients.reduce((sum, client) => sum + client.configuration_count, 0)}</Heading></div></div>
    <div className="flex flex-col gap-3">{clients.map((client) => <details key={client.id} className="rounded border p-4"><summary className="cursor-pointer"><span className="font-semibold">{client.name}</span> · {client.company_name || client.organization_name} <span className="text-ui-fg-subtle">· {client.email}</span></summary><div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2"><p><strong>Email:</strong> {client.email || "Not provided"}</p><p><strong>Phone:</strong> {client.phone || "Not provided"}</p><p><strong>Company:</strong> {client.company_name || client.organization_name}</p><p><strong>VAT:</strong> {client.vat_number || "Not provided"}</p><p><strong>Billing:</strong> {addressText(client.billing_address)}</p><p><strong>Delivery:</strong> {addressText(client.delivery_address)}</p><p><strong>Created:</strong> {shortDate(client.created_at)}</p><p><strong>Status:</strong> {client.status}</p><p><strong>Submitted quotes:</strong> {client.quote_count} · latest {shortDate(client.last_quote_at)}</p><p><strong>Saved configurations:</strong> {client.configuration_count} · latest {shortDate(client.last_configuration_at)}</p></div><div className="mt-4 border-t pt-4"><Button size="small" variant="secondary" onClick={() => { setDeleteTarget(client.id === deleteTarget ? "" : client.id); setConfirmEmail("") }}>Delete account</Button>{deleteTarget === client.id && <div className="mt-3 max-w-lg rounded border border-ui-border-error p-3"><Text size="small">This removes the client login and company membership. Existing quote records remain for your business history. Type <strong>{client.email}</strong> to confirm.</Text><Input className="mt-2" type="email" value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} placeholder="Client email" /><div className="mt-3 flex gap-2"><Button size="small" variant="danger" disabled={confirmEmail.trim().toLowerCase() !== client.email.toLowerCase()} isLoading={busy} onClick={() => deleteClient(client)}>Permanently delete</Button><Button size="small" variant="secondary" onClick={() => setDeleteTarget("")}>Cancel</Button></div></div>}</div></details>)}{clients.length === 0 && <Text className="text-ui-fg-subtle">No client accounts yet.</Text>}</div>
    {clients.length < clientCount && <Button className="mt-4" variant="secondary" onClick={() => loadClients(clients.length).catch((error) => toast.error(error.message))}>Load more clients</Button>}
  </Container><Container><Heading level="h2">Create client account</Heading><Text className="mt-2 text-ui-fg-subtle">Enter business details once. MerchPortal emails a temporary password from your configured Zoho sender.</Text><form className="mt-4 flex flex-col gap-5" onSubmit={submit}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="flex flex-col gap-1 text-sm">First name<Input required maxLength={60} value={form.first_name} onChange={(event) => change("first_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Last name<Input required maxLength={60} value={form.last_name} onChange={(event) => change("last_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Email<Input type="email" required value={form.contact_email} onChange={(event) => change("contact_email", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Phone<Input type="tel" required maxLength={40} value={form.phone} onChange={(event) => change("phone", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Company name<Input required maxLength={160} value={form.company_name} onChange={(event) => change("company_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">VAT number (optional)<Input maxLength={50} value={form.vat_number} onChange={(event) => change("vat_number", event.target.value)} /></label></div>
    <label className="flex flex-col gap-1 text-sm">Company<select className="rounded-md border p-2" value={form.organization_id} onChange={(event) => change("organization_id", event.target.value)}><option value="">Create a new company using these details</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <section className="flex flex-col gap-3 border-t pt-4"><Heading level="h2">Billing address</Heading>{addressFields("billing_address")}</section>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameDelivery} onChange={(event) => setSameDelivery(event.target.checked)} />Delivery address is the same as billing</label>
    {!sameDelivery && <section className="flex flex-col gap-3 border-t pt-4"><Heading level="h2">Delivery address</Heading>{addressFields("delivery_address")}</section>}
    <div><Button type="submit" isLoading={busy}>Create client and send invitation</Button></div>
  </form></Container></div>
}

export const config = defineRouteConfig({ label: "Clients" })
export default ClientsPage
