import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Entry = {
  id: string
  recipient: string
  template_id: string
  status: "accepted" | "failed"
  failure_code?: string
  created_at: string
}
type History = {
  entries: Entry[]
  total: number
  page: number
  page_size: number
}

export default function DeliveryHistory({
  templates,
}: {
  templates: Array<{ id: string; name: string }>
}) {
  const [page, setPage] = useState(1)
  const [templateId, setTemplateId] = useState("")
  const [status, setStatus] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [history, setHistory] = useState<History>({
    entries: [],
    total: 0,
    page: 1,
    page_size: 25,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    setError("")
    fetch(
      `/admin/merchportal/email-deliveries?${new URLSearchParams({ page: String(page), ...(templateId ? { template_id: templateId } : {}), ...(status ? { status } : {}) })}`,
      { credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load email delivery history")
        const result = await response.json()
        if (!controller.signal.aborted) setHistory(result)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [page, templateId, status, refresh])
  return (
    <Container>
      <Heading level="h2">Email delivery history</Heading>
      <Text className="mt-2 text-ui-fg-subtle">
        SMTP accepted means the sending server accepted the email, not that it
        reached the recipient’s inbox. History starts after this update and is
        kept for 90 days. No bodies, subjects, passwords or reset tokens are
        stored.
      </Text>
      <div className="mt-3 flex flex-wrap gap-3">
        <select
          className="rounded border p-2"
          aria-label="Email type"
          value={templateId}
          onChange={(event) => {
            setTemplateId(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All email types</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <select
          className="rounded border p-2"
          aria-label="Delivery status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All outcomes</option>
          <option value="accepted">SMTP accepted</option>
          <option value="failed">Sending failed</option>
        </select>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setRefresh(refresh + 1)}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <Text className="mt-3 text-ui-fg-error" role="alert">
          {error}
        </Text>
      )}
      {busy && (
        <Text className="mt-3" role="status">
          Loading history…
        </Text>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Recipient</th>
              <th className="p-2">Email type</th>
              <th className="p-2">Time</th>
              <th className="p-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {history.entries.map((entry) => (
              <tr className="border-t" key={entry.id}>
                <td className="p-2">{entry.recipient}</td>
                <td className="p-2">
                  {templates.find(
                    (template) => template.id === entry.template_id,
                  )?.name || entry.template_id}
                </td>
                <td className="p-2">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="p-2">
                  {entry.status === "accepted"
                    ? "SMTP accepted"
                    : `Sending failed · ${entry.failure_code || "SEND_FAILED"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && !history.entries.length && (
          <Text className="mt-3">No emails recorded for this view.</Text>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="secondary"
          size="small"
          disabled={busy || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Text>
          Page {page} of{" "}
          {Math.max(1, Math.ceil(history.total / history.page_size))} ·{" "}
          {history.total} emails
        </Text>
        <Button
          variant="secondary"
          size="small"
          disabled={busy || page * history.page_size >= history.total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </Container>
  )
}
