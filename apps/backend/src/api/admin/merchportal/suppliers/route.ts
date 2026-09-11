import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import {
  ensureSuppliers,
  supplierCredentialStatus,
} from "../../../../modules/merchportal/sync"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = await ensureSuppliers(req.scope)
  const jobs = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
  res.json({
    suppliers: suppliers.map((supplier: any) => ({
      ...supplier,
      configured: supplierCredentialStatus(supplier.code),
      due: {
        catalog: !supplier.product_sync_at || Date.now() - new Date(supplier.product_sync_at).getTime() > 86_400_000,
        price: !supplier.price_sync_at || Date.now() - new Date(supplier.price_sync_at).getTime() > 86_400_000,
        stock: !supplier.stock_sync_at || Date.now() - new Date(supplier.stock_sync_at).getTime() > 3_600_000,
      },
    })),
    jobs,
  })
}
