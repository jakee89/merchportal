import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { SyncKind } from "../../../../../../modules/merchportal/adapters"
import { supplierSyncWorkflow } from "../../../../../../workflows/supplier-sync"
import { requireStaff } from "../../../auth"

type Body = { kind?: SyncKind; dry_run?: boolean }

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
  if (!["stricker", "midocean"].includes(code)) {
    res.status(400).json({ message: "Choose a supported supplier" })
    return
  }
  if (req.body.dry_run && kind !== "catalog") {
    res.status(400).json({ message: "A preview is available for catalog updates only" })
    return
  }
  setImmediate(() => {
    supplierSyncWorkflow(req.scope).run({
      input: { supplier_code: code, kind, trigger: "manual", dry_run: Boolean(req.body.dry_run) },
    }).catch(() => undefined)
  })
  res.status(202).json({ message: req.body.dry_run ? "Catalog preview queued" : `${kind} update queued` })
}
