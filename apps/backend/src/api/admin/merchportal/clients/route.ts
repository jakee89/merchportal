import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { listPortalClients } from "../../../../modules/merchportal/client-admin"
import { createPortalClientWorkflow } from "../../../../workflows/create-portal-client"
import { requireStaff } from "../auth"

type Body = { first_name?: string; last_name?: string; contact_name?: string; contact_email?: string; phone?: string; company_name?: string; vat_number?: string; billing_address?: Record<string, unknown>; delivery_address?: Record<string, unknown>; organization_id?: string }

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0))
  const limit = Math.max(1, Math.min(50, Math.floor(Number(req.query.limit) || 25)))
  res.json(await listPortalClients(req.scope, offset, limit))
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (!staff.permissions?.includes("*") && staff.role !== "super_admin") throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Only a super administrator can create client accounts")
  const { result } = await createPortalClientWorkflow(req.scope).run({ input: req.body as any })
  res.status(201).json(result)
}
