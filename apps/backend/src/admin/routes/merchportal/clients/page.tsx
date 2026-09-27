import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Address = { line1: string; line2: string; city: string; postal_code: string; country_code: string }
type Form = { first_name: string; last_name: string; contact_email: string; phone: string; company_name: string; vat_number: string; organization_id: string; billing_address: Address; delivery_address: Address }
const blankAddress = (): Address => ({ line1: "", line2: "", city: "", postal_code: "", country_code: "mt" })
const blankForm = (): Form => ({ first_name: "", last_name: "", contact_email: "", phone: "", company_name: "", vat_number: "", organization_id: "", billing_address: blankAddress(), delivery_address: blankAddress() })
const countryNames = new Intl.DisplayNames(["en"], { type: "region" })
const countries = Array.from({ length: 26 * 26 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26))
  .map((code) => ({ code: code.toLowerCase(), name: countryNames.of(code) || code }))
  .filter(({ code, name }) => name.toUpperCase() !== code.toUpperCase() && name !== "Unknown Region")
  .sort((left, right) => left.name.localeCompare(right.name))

const ClientsPage = () => {
  const [form, setForm] = useState<Form>(blankForm)
  const [sameDelivery, setSameDelivery] = useState(true)
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const change = (key: keyof Omit<Form, "billing_address" | "delivery_address">, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const changeAddress = (kind: "billing_address" | "delivery_address", key: keyof Address, value: string) => setForm((current) => ({ ...current, [kind]: { ...current[kind], [key]: value } }))

  useEffect(() => { fetch("/admin/merchportal/organizations", { credentials: "include" }).then((response) => response.json()).then((body) => setOrganizations(body.organizations || [])).catch(() => toast.error("Could not load client companies")) }, [])
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch("/admin/merchportal/clients", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, contact_name: `${form.first_name} ${form.last_name}`.trim(), delivery_address: sameDelivery ? form.billing_address : form.delivery_address, organization_id: form.organization_id || undefined }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Could not create client")
      if (body.email_sent) toast.success("Client account created and invitation emailed")
      else toast.error("Client account created, but the email could not be sent. Check the no-reply Zoho alias and ask the client to use Forgot password.")
      setForm(blankForm())
      setSameDelivery(true)
    } catch (error) { toast.error((error as Error).message) } finally { setBusy(false) }
  }
  const addressFields = (kind: "billing_address" | "delivery_address") => <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <label className="flex flex-col gap-1 text-sm">Street address<Input required maxLength={160} value={form[kind].line1} onChange={(event) => changeAddress(kind, "line1", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Address line 2 (optional)<Input maxLength={160} value={form[kind].line2} onChange={(event) => changeAddress(kind, "line2", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">City<Input required maxLength={100} value={form[kind].city} onChange={(event) => changeAddress(kind, "city", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Postal code<Input required maxLength={24} value={form[kind].postal_code} onChange={(event) => changeAddress(kind, "postal_code", event.target.value)} /></label>
    <label className="flex flex-col gap-1 text-sm">Country<select className="rounded-md border p-2" value={form[kind].country_code} onChange={(event) => changeAddress(kind, "country_code", event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
  </div>

  return <div className="flex flex-col gap-4"><Container><Heading level="h1">Create client account</Heading><Text className="mt-2 text-ui-fg-subtle">Enter business details once. MerchPortal generates a temporary password and emails it from your verified no-reply Zoho alias.</Text></Container><Container><form className="flex flex-col gap-5" onSubmit={submit}>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><label className="flex flex-col gap-1 text-sm">First name<Input required maxLength={60} value={form.first_name} onChange={(event) => change("first_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Last name<Input required maxLength={60} value={form.last_name} onChange={(event) => change("last_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Email<Input type="email" required value={form.contact_email} onChange={(event) => change("contact_email", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Phone<Input type="tel" required maxLength={40} value={form.phone} onChange={(event) => change("phone", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">Company name<Input required maxLength={160} value={form.company_name} onChange={(event) => change("company_name", event.target.value)} /></label><label className="flex flex-col gap-1 text-sm">VAT number (optional)<Input maxLength={50} value={form.vat_number} onChange={(event) => change("vat_number", event.target.value)} /></label></div>
    <label className="flex flex-col gap-1 text-sm">Company<select className="rounded-md border p-2" value={form.organization_id} onChange={(event) => change("organization_id", event.target.value)}><option value="">Create a new company using these details</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
    <section className="flex flex-col gap-3 border-t pt-4"><Heading level="h2">Billing address</Heading>{addressFields("billing_address")}</section>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameDelivery} onChange={(event) => setSameDelivery(event.target.checked)} />Delivery address is the same as billing</label>
    {!sameDelivery && <section className="flex flex-col gap-3 border-t pt-4"><Heading level="h2">Delivery address</Heading>{addressFields("delivery_address")}</section>}
    <div><Button type="submit" isLoading={busy}>Create client and send invitation</Button></div>
  </form></Container></div>
}

export const config = defineRouteConfig({ label: "Create client" })
export default ClientsPage
