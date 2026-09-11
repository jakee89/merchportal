import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { requireStaff } from "../auth"

type OrganizationBody = {
  name?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  billing_address?: Record<string, unknown>
  shipping_address?: Record<string, unknown>
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const organizations = await service.listOrganizations({}, { order: { created_at: "DESC" } })
  const memberships = await service.listMemberships({ actor_type: "customer" })
  res.json({ organizations, memberships })
}

export async function POST(req: AuthenticatedMedusaRequest<OrganizationBody>, res: MedusaResponse) {
  await requireStaff(req)
  const name = req.body?.name?.trim()
  if (!name) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Company name is required")
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"
  const organization = await service.createOrganizations({
    name,
    slug: `${base}-${randomBytes(3).toString("hex")}`,
    join_code: randomBytes(4).toString("hex").toUpperCase(),
    logo_url: req.body.logo_url || null,
    primary_color: req.body.primary_color || "#0b6ffb",
    secondary_color: req.body.secondary_color || "#0b2545",
    billing_address: req.body.billing_address || null,
    shipping_address: req.body.shipping_address || null,
    status: "active",
  })
  res.status(201).json({ organization })
}
