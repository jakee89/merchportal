import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createSupplierAdapter } from "../../../../../../modules/merchportal/adapters"
import { requireStaff } from "../../../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  try {
    const adapter = createSupplierAdapter(req.params.code)
    res.json({ connection: await adapter.testConnection() })
  } catch (error) {
    res.json({
      connection: {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      },
    })
  }
}
