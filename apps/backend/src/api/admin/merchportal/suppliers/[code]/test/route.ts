import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createSupplierAdapter } from "../../../../../../modules/merchportal/adapters"
import { requireStaff } from "../../../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const adapter = createSupplierAdapter(req.params.code)
  res.json({ connection: await adapter.testConnection() })
}
