import type { MedusaContainer } from "@medusajs/framework/types"
import { ensureSuppliers } from "../modules/merchportal/sync"
import { supplierCredentialStatus } from "../modules/merchportal/supplier-credentials"
import { supplierSyncWorkflow } from "../workflows/supplier-sync"

export default async function supplierStockSync(container: MedusaContainer) {
  const suppliers = await ensureSuppliers(container)
  for (const code of ["stricker", "midocean", "aodaci"] as const) {
    const supplier = suppliers.find((item: any) => item.code === code)
    if (supplierCredentialStatus(code, supplier?.configuration)) {
      await supplierSyncWorkflow(container).run({ input: { supplier_code: code, kind: "stock", trigger: "scheduled" } }).catch(() => undefined)
    }
  }
}

export const config = { name: "supplier-stock-hourly", schedule: "5 * * * *" }
