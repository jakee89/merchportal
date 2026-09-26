import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createSupplierAdapter } from "../../../../../../modules/merchportal/adapters"
import { MERCHPORTAL_MODULE } from "../../../../../../modules/merchportal"
import { resolveSupplierCredential } from "../../../../../../modules/merchportal/supplier-credentials"
import { requireStaff } from "../../../auth"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  try {
    const code = req.params.code as "stricker" | "midocean" | "aodaci" | "makito"
    if (!["stricker", "midocean", "aodaci", "makito"].includes(code)) {
      res.status(400).json({ message: "Choose a supported supplier" })
      return
    }
    const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
    const [supplier] = await service.listSuppliers({ code }, { take: 1 })
    const adapter = createSupplierAdapter(code, resolveSupplierCredential(code, supplier?.configuration))
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
