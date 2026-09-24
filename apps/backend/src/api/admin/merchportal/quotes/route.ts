import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { quoteWithItems } from "../../../../workflows/quote-cart"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const quotes = await service.listQuoteRequests({ status: ["submitted", "quoted"] }, { take: 100, order: { created_at: "DESC" } })
  const organizationIds = [...new Set(quotes.map((quote: any) => quote.organization_id))]
  const organizations = organizationIds.length ? await service.listOrganizations({ id: organizationIds }) : []
  const names = new Map<string, string>(organizations.map((organization: any) => [organization.id, organization.name]))
  res.json({ quotes: await Promise.all(quotes.map(async (quote: any) => ({ ...await quoteWithItems(service, quote), organization_name: names.get(quote.organization_id) || "Client" }))) })
}
