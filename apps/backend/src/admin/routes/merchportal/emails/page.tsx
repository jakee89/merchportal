import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import DeliveryHistory from "./delivery-history"

type Preview = { subject: string; html: string }
type Template = {
  id: string
  name: string
  audience: string
  trigger: string
  subject: string
  html: string
  default_subject: string
  default_html: string
  variables: string[]
  required: string[]
  customized: boolean
  updated_at: string | null
  preview: Preview
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json" } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`)
  return body
}

const previewPolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`
function previewDocument(html: string) {
  return /<head\b[^>]*>/iu.test(html) ? html.replace(/<head\b[^>]*>/iu, (head) => `${head}${previewPolicy}`) : `${previewPolicy}${html}`
}

const EmailTemplatesPage = () => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [canEdit, setCanEdit] = useState(false)
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [preview, setPreview] = useState<Preview>()
  const [previewedDraft, setPreviewedDraft] = useState("")
  const [busy, setBusy] = useState("loading")
  const [error, setError] = useState("")
  const [mobilePreview, setMobilePreview] = useState(false)
  const selected = templates.find((template) => template.id === selectedId)
  const dirty = Boolean(selected && (subject !== selected.subject || html !== selected.html))
  const draftKey = JSON.stringify([subject, html])

  const selectTemplate = (template: Template) => {
    setSelectedId(template.id)
    setSubject(template.subject)
    setHtml(template.html)
    setPreview(template.preview)
    setPreviewedDraft(JSON.stringify([template.subject, template.html]))
    setError("")
  }

  const refresh = async (id?: string) => {
    const data = await api<{ templates: Template[]; can_edit: boolean }>("/admin/merchportal/email-templates")
    setTemplates(data.templates)
    setCanEdit(data.can_edit)
    const template = data.templates.find((item) => item.id === id) || data.templates[0]
    if (template) selectTemplate(template)
  }

  useEffect(() => {
    refresh().catch((error) => setError(error.message)).finally(() => setBusy(""))
  }, [])

  const previewDraft = async () => {
    if (!selected) return
    setBusy("preview")
    setError("")
    try {
      const result = await api<{ preview: Preview }>(`/admin/merchportal/email-templates/${selected.id}/preview`, { method: "POST", body: JSON.stringify({ subject, html }) })
      setPreview(result.preview)
      setPreviewedDraft(draftKey)
    } catch (error) { setError((error as Error).message) } finally { setBusy("") }
  }

  const save = async (reset = false) => {
    if (!selected) return
    if (reset && !window.confirm(`Restore the default ${selected.name} template? This replaces your saved HTML and discards draft changes.`)) return
    setBusy(reset ? "reset" : "save")
    setError("")
    try {
      await api(`/admin/merchportal/email-templates/${selected.id}`, { method: "POST", body: JSON.stringify(reset ? { reset: true } : { subject, html }) })
      await refresh(selected.id)
      toast.success(reset ? "Default template restored" : "Email template saved for future emails")
    } catch (error) { setError((error as Error).message) } finally { setBusy("") }
  }

  return <div className="space-y-4">
    <Container>
      <Heading level="h1">Email templates</Heading>
      <Text className="mt-2 text-ui-fg-subtle">All email types currently sent by MerchPortal. Edit the subject and HTML to adjust branding. Changes apply to future emails only. Delivery history is shown below.</Text>
      <div className="mt-3 flex flex-wrap gap-4"><a className="text-ui-fg-interactive" href="/app/merchportal/settings">Sender & Zoho settings →</a><a className="text-ui-fg-interactive" href="/app/merchportal">MerchPortal overview →</a></div>
      {busy === "loading" && <Text className="mt-3">Loading email templates…</Text>}
      {error && <Text className="mt-3 text-ui-fg-error" role="alert">{error}</Text>}
      {!canEdit && templates.length > 0 && <Text className="mt-3">Read-only: only super administrators can save template changes.</Text>}
    </Container>
    <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Container className="space-y-2">
        <Heading level="h2">Emails · {templates.length}</Heading>
        {templates.map((template) => <button key={template.id} type="button" disabled={Boolean(busy)} aria-pressed={selectedId === template.id} className={`w-full rounded-lg border p-3 text-left ${selectedId === template.id ? "border-ui-border-interactive bg-ui-bg-highlight" : "border-ui-border-base"}`} onClick={() => {
          if (dirty && !window.confirm("Discard your unsaved template changes?")) return
          selectTemplate(template)
        }}><Text weight="plus">{template.name}</Text><Text size="small" className="text-ui-fg-subtle">{template.audience}</Text><Text size="small">{template.customized ? "Custom template" : "Default template"}</Text></button>)}
      </Container>
      {selected && <div className="min-w-0 space-y-4">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3"><Heading level="h2">{selected.name}</Heading><Text size="small">{dirty ? "Unsaved changes" : selected.customized ? "Saved custom template" : "Default template"}</Text></div>
          <Text className="mt-2 text-ui-fg-subtle">{selected.trigger}</Text>
          {selected.updated_at && <Text size="small" className="mt-1 text-ui-fg-subtle">Last saved: {new Date(selected.updated_at).toLocaleString()}</Text>}
          <label className="mt-4 block text-sm">Email subject<Input className="mt-1" value={subject} maxLength={200} disabled={!canEdit || Boolean(busy)} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="mt-4 block text-sm">Email HTML<textarea className="mt-1 w-full rounded-lg border border-ui-border-base bg-ui-bg-field p-3 font-mono text-xs leading-5" aria-label="Email HTML" rows={16} spellCheck={false} value={html} disabled={!canEdit || Boolean(busy)} onChange={(event) => setHtml(event.target.value)} /></label>
          <Text size="small" className="mt-2 text-ui-fg-subtle">Use inline CSS for reliable email styling. These placeholders insert live data; keep the required ones. The product block includes printing and protected artwork links.</Text>
          <div className="mt-2 flex flex-wrap gap-2">{selected.variables.map((variable) => <code className="rounded border border-ui-border-base px-2 py-1 text-xs" key={variable}>{`{{${variable}}}`}{selected.required.includes(variable) ? " · required" : ""}</code>)}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={Boolean(busy)} isLoading={busy === "preview"} onClick={previewDraft}>Preview changes</Button>
            <Button disabled={!canEdit || !dirty || Boolean(busy)} isLoading={busy === "save"} onClick={() => save()}>Save template</Button>
            <Button variant="secondary" disabled={!dirty || Boolean(busy)} onClick={() => selectTemplate(selected)}>Discard changes</Button>
            <Button variant="secondary" disabled={!canEdit || Boolean(busy) || (!selected.customized && !dirty)} isLoading={busy === "reset"} onClick={() => save(true)}>Restore default</Button>
          </div>
        </Container>
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3"><Heading level="h2">Sample preview</Heading><div className="flex gap-2"><Button size="small" variant={mobilePreview ? "secondary" : "primary"} onClick={() => setMobilePreview(false)}>Desktop</Button><Button size="small" variant={mobilePreview ? "primary" : "secondary"} onClick={() => setMobilePreview(true)}>Mobile</Button></div></div>
          <Text size="small" className="mt-2 text-ui-fg-subtle">Fictional sample data only. No emails are sent by previewing. Your email app may render HTML slightly differently.</Text>
          {previewedDraft !== draftKey && <Text className="mt-2 text-ui-fg-error">Preview is out of date. Click Preview changes to render your draft.</Text>}
          {preview && <><Text className="my-3" weight="plus">Subject: {preview.subject}</Text><iframe title={`${selected.name} sample email preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={previewDocument(preview.html)} className="mx-auto h-[650px] max-w-full rounded-lg border border-ui-border-base bg-white" style={{ width: mobilePreview ? 375 : "100%" }} /></>}
        </Container>
      </div>}
    </div>
    <DeliveryHistory templates={templates} />
  </div>
}

export const config = defineRouteConfig({ label: "Email templates" })
export default EmailTemplatesPage
