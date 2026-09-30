import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { catalogHealth } from "../../../../modules/merchportal/catalog-health"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  res.json(await catalogHealth(req.scope, { supplier_id: typeof req.query.supplier_id === "string" ? req.query.supplier_id : undefined, issue: typeof req.query.issue === "string" ? req.query.issue : undefined, page: Math.max(1, Math.floor(Number(req.query.page) || 1)), stale_hours: Math.max(1, Math.min(720, Number(req.query.stale_hours) || 48)) }))
}
