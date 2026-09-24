import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import {
  ensureSuppliers,
  reconcileStaleImportJobs,
} from "../../../../modules/merchportal/sync"
import { supplierCredentialStatus } from "../../../../modules/merchportal/supplier-credentials"
import { requireStaff } from "../auth"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  await reconcileStaleImportJobs(service)
  const suppliers = await ensureSuppliers(req.scope)
  const jobs = await service.listImportJobs({}, { take: 30, order: { created_at: "DESC" } })
  const suppliersById = new Map<string, any>(
    suppliers.map((supplier: any) => [supplier.id, supplier])
  )
  res.json({
    suppliers: suppliers.map((supplier: any) => ({
      id: supplier.id,
      code: supplier.code,
      display_name: supplier.display_name,
      status: supplier.status,
      product_sync_at: supplier.product_sync_at,
      price_sync_at: supplier.price_sync_at,
      stock_sync_at: supplier.stock_sync_at,
      last_error: supplier.last_error,
      configured: supplierCredentialStatus(supplier.code, supplier.configuration),
      due: {
        catalog: !supplier.product_sync_at || Date.now() - new Date(supplier.product_sync_at).getTime() > 86_400_000,
        price: !supplier.price_sync_at || Date.now() - new Date(supplier.price_sync_at).getTime() > 86_400_000,
        stock: !supplier.stock_sync_at || Date.now() - new Date(supplier.stock_sync_at).getTime() > 3_600_000,
      },
    })),
    jobs: jobs.map((job: any) => ({
      ...job,
      supplier_code: suppliersById.get(job.supplier_id)?.code || "unknown",
      supplier_name:
        suppliersById.get(job.supplier_id)?.display_name || "Unknown supplier",
    })),
  })
}
