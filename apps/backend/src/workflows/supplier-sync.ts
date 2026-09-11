import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { runSupplierSync } from "../modules/merchportal/sync"
import type { SyncKind } from "../modules/merchportal/adapters"
import { refreshPublishedSupplierProducts } from "./publish-normalized-products"
import { ensureCategoryMappings } from "./manage-category-mappings"

type Input = {
  supplier_code: "stricker" | "midocean"
  kind: SyncKind
  trigger: "manual" | "scheduled"
}

const syncSupplierStep = createStep("sync-supplier", async (input: Input, { container }) => {
  const job = await runSupplierSync(container, input.supplier_code, input.kind, input.trigger)
  if (input.kind === "catalog") {
    await ensureCategoryMappings(container, input.supplier_code)
  }
  const catalog = input.kind === "catalog" ? undefined :
    await refreshPublishedSupplierProducts(container, input.supplier_code)
  return new StepResponse({ job, catalog })
})

export const supplierSyncWorkflow = createWorkflow("supplier-sync", (input: Input) => {
  return new WorkflowResponse(syncSupplierStep(input))
})
