export async function recordEmailDelivery(
  service: any,
  templateId: string,
  recipient: string,
  status: "accepted" | "failed",
  failureCode?: string,
) {
  try {
    // Deliberately no subject, body, variables, SMTP response or raw error.
    await service.createEmailDeliveries({
      recipient: recipient.slice(0, 254),
      template_id: templateId,
      status,
      failure_code: failureCode || null,
    })
  } catch {
    // An SMTP-accepted message must never be reported as failed or retried
    // merely because the history database is temporarily unavailable.
    console.warn("Email delivery history could not be recorded")
  }
}

export function emailFailureCode(error: unknown) {
  const code = (error as { code?: unknown })?.code
  return typeof code === "string" &&
    [
      "EAUTH",
      "ECONNECTION",
      "ETIMEDOUT",
      "ESOCKET",
      "EENVELOPE",
      "EMESSAGE",
      "EDNS",
    ].includes(code)
    ? code
    : "SEND_FAILED"
}

export async function emailDeliveryHistory(
  service: any,
  query: Record<string, unknown>,
) {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)))
  const filters: Record<string, string> = {}
  if (query.status === "accepted" || query.status === "failed")
    filters.status = query.status
  if (typeof query.template_id === "string" && query.template_id.length <= 80)
    filters.template_id = query.template_id
  const [entries, total] = await service.listAndCountEmailDeliveries(filters, {
    take: 25,
    skip: (page - 1) * 25,
    order: { created_at: "DESC" },
  })
  return {
    entries: entries.map((entry: any) => ({
      id: entry.id,
      recipient: entry.recipient,
      template_id: entry.template_id,
      status: entry.status,
      failure_code: entry.failure_code,
      created_at: entry.created_at,
    })),
    total,
    page,
    page_size: 25,
  }
}
