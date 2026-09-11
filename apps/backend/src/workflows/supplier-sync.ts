import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { runSupplierSync } from "../modules/merchportal/sync"
import type { SyncKind } from "../modules/merchportal/adapters"

type Input = {
  supplier_code: "stricker" | "midocean"
  kind: SyncKind
  trigger: "manual" | "scheduled"
}

const syncSupplierStep = createStep("sync-supplier", async (input: Input, { container }) => {
  return new StepResponse(await runSupplierSync(container, input.supplier_code, input.kind, input.trigger))
})

export const supplierSyncWorkflow = createWorkflow("supplier-sync", (input: Input) => {
  return new WorkflowResponse(syncSupplierStep(input))
})
