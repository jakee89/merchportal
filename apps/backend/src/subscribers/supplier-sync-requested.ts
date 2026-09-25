import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { SyncKind } from "../modules/merchportal/adapters"
import { supplierSyncWorkflow } from "../workflows/supplier-sync"

type SupplierSyncRequested = {
  supplier_code: "stricker" | "midocean" | "aodaci"
  kind: SyncKind
  trigger: "manual"
  dry_run?: boolean
  job_id: string
}

export default async function supplierSyncRequested({
  event: { data },
  container,
}: SubscriberArgs<SupplierSyncRequested>) {
  await supplierSyncWorkflow(container).run({
    input: {
      supplier_code: data.supplier_code,
      kind: data.kind,
      trigger: data.trigger,
      dry_run: data.dry_run,
      job_id: data.job_id,
    },
  })
}

export const config: SubscriberConfig = {
  event: "merchportal.supplier_sync.requested",
}
