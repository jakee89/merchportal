import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { SyncKind } from "../../../../../../modules/merchportal/adapters"
import { supplierSyncWorkflow } from "../../../../../../workflows/supplier-sync"
import { requireStaff } from "../../../auth"

type Body = { kind?: SyncKind }

export async function POST(
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) {
  await requireStaff(req)
  const kind = req.body.kind
  if (!kind || !["catalog", "price", "stock"].includes(kind)) {
    res.status(400).json({ message: "Choose catalog, price, or stock" })
    return
  }
  const code = req.params.code as "stricker" | "midocean"
  setImmediate(() => {
    supplierSyncWorkflow(req.scope).run({
      input: { supplier_code: code, kind, trigger: "manual" },
    }).catch(() => undefined)
  })
  res.status(202).json({ message: `${kind} update queued` })
}
