import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { encryptSupplierCredential } from "../../../../../../modules/merchportal/supplier-credentials"
import { ensureSuppliers } from "../../../../../../modules/merchportal/sync"
import { requireStaff } from "../../../auth"

type Body = { api_key?: string }

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin") {
    res.status(403).json({ message: "Only a super administrator can change supplier credentials" })
    return
  }

  const code = req.params.code as "stricker" | "midocean" | "aodaci"
  const apiKey = typeof req.body?.api_key === "string" ? req.body.api_key.trim() : ""
  if (!["stricker", "midocean", "aodaci"].includes(code) || !apiKey || apiKey.length > 4096) {
    res.status(400).json({ message: "Choose a supported supplier and provide a valid API key" })
    return
  }

  const supplier = (await ensureSuppliers(req.scope)).find((item: any) => item.code === code)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  await service.updateSuppliers({
    id: supplier.id,
    configuration: {
      ...(supplier.configuration && typeof supplier.configuration === "object" ? supplier.configuration : {}),
      encrypted_api_key: encryptSupplierCredential(code, apiKey),
    },
  })
  res.json({ configured: true })
}
