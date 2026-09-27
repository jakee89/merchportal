import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { removeCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { clearPortalUsage } from "../modules/merchportal/portal-usage"

type Input = { customer_id: string; confirm_email: string }

const deleteClientStep = createStep("delete-client", async (input: Input, { container }) => {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const customers = container.resolve(Modules.CUSTOMER) as any
  const membership = (await service.listMemberships({ actor_id: input.customer_id, actor_type: "customer" }, { take: 1 }))[0]
  if (!membership) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Client account not found")
  const customer = await customers.retrieveCustomer(input.customer_id)
  if (String(input.confirm_email || "").trim().toLowerCase() !== String(customer.email || "").toLowerCase()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Type the client's email address to confirm deletion")
  }
  await removeCustomerAccountWorkflow(container).run({ input: { customerId: customer.id } })
  await service.deleteMemberships(membership.id)
  await clearPortalUsage(container, customer.id)
  return new StepResponse({ deleted: true, customer_id: customer.id })
})

export const deletePortalClientWorkflow = createWorkflow("delete-portal-client", (input: Input) => new WorkflowResponse(deleteClientStep(input)))
