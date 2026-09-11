import type { MedusaContainer } from "@medusajs/framework/types"
import { supplierCredentialStatus } from "../modules/merchportal/sync"
import { supplierSyncWorkflow } from "../workflows/supplier-sync"

export default async function supplierCatalogSync(container: MedusaContainer) {
  for (const code of ["stricker", "midocean"] as const) {
    if (supplierCredentialStatus(code)) {
      await supplierSyncWorkflow(container).run({ input: { supplier_code: code, kind: "catalog", trigger: "scheduled" } }).catch(() => undefined)
    }
  }
}

export const config = { name: "supplier-catalog-daily", schedule: "45 1 * * *" }
