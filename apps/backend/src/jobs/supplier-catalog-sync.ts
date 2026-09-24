import type { MedusaContainer } from "@medusajs/framework/types"
import { ensureSuppliers } from "../modules/merchportal/sync"
import { supplierCredentialStatus } from "../modules/merchportal/supplier-credentials"
import { supplierSyncWorkflow } from "../workflows/supplier-sync"

export default async function supplierCatalogSync(container: MedusaContainer) {
  const suppliers = await ensureSuppliers(container)
  for (const code of ["stricker", "midocean"] as const) {
    const supplier = suppliers.find((item: any) => item.code === code)
    if (supplierCredentialStatus(code, supplier?.configuration)) {
      await supplierSyncWorkflow(container).run({ input: { supplier_code: code, kind: "catalog", trigger: "scheduled" } }).catch(() => undefined)
    }
  }
}

export const config = { name: "supplier-catalog-daily", schedule: "45 1 * * *" }
