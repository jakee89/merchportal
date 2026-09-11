import type { MedusaContainer } from "@medusajs/framework/types"
import { supplierCredentialStatus } from "../modules/merchportal/sync"
import { supplierSyncWorkflow } from "../workflows/supplier-sync"

export default async function supplierPriceSync(container: MedusaContainer) {
  for (const code of ["stricker", "midocean"] as const) {
    if (supplierCredentialStatus(code)) {
      await supplierSyncWorkflow(container).run({ input: { supplier_code: code, kind: "price", trigger: "scheduled" } }).catch(() => undefined)
    }
  }
}

export const config = { name: "supplier-price-daily", schedule: "15 2 * * *" }
