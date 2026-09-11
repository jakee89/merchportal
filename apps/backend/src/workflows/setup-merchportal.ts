import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ensureMaltaCommerce } from "../modules/merchportal/setup"

const setupStep = createStep("setup", async (input: { user_id: string }, { container }) => {
  return new StepResponse(await ensureMaltaCommerce(container, input.user_id))
})

export const setupMerchPortalWorkflow = createWorkflow("setup-merch-portal", (input: { user_id: string }) => {
  return new WorkflowResponse(setupStep(input))
})
