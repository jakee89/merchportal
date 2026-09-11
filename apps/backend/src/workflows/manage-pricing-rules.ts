import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

type Input = { organization_id?: string | null; markup_percentage?: number }

export async function resolveMarkup(service: any, organizationId?: string | null) {
  if (organizationId) {
    const clientRules = await service.listPricingRules(
      { scope_key: `organization:${organizationId}`, status: "active" },
      { take: 1 }
    )
    if (clientRules.length) return Number(clientRules[0].markup_percentage)
  }
  const globalRules = await service.listPricingRules(
    { scope_key: "global", status: "active" },
    { take: 1 }
  )
  return globalRules.length ? Number(globalRules[0].markup_percentage) : 30
}

const managePricingRulesStep = createStep(
  "manage-pricing-rules",
  async (input: Input, { container }) => {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    if (input.markup_percentage !== undefined) {
      if (
        !Number.isFinite(input.markup_percentage) ||
        input.markup_percentage < 0 ||
        input.markup_percentage > 1000
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Markup must be between 0 and 1000 percent"
        )
      }
      const scopeKey = input.organization_id
        ? `organization:${input.organization_id}`
        : "global"
      const existing = await service.listPricingRules(
        { scope_key: scopeKey },
        { take: 1 }
      )
      const data = {
        scope_key: scopeKey,
        organization_id: input.organization_id || null,
        markup_percentage: input.markup_percentage,
        status: "active",
      }
      if (existing.length) {
        await service.updatePricingRules({ id: existing[0].id, ...data })
      } else {
        await service.createPricingRules(data)
      }
    }
    let globalRules = await service.listPricingRules(
      { scope_key: "global" },
      { take: 1 }
    )
    if (!globalRules.length) {
      globalRules = [await service.createPricingRules({
        scope_key: "global",
        organization_id: null,
        markup_percentage: 30,
        status: "active",
      })]
    }
    const [rules, organizations] = await Promise.all([
      service.listPricingRules({}, { order: { scope_key: "ASC" } }),
      service.listOrganizations({ status: "active" }),
    ])
    return new StepResponse({ rules, organizations })
  }
)

export const managePricingRulesWorkflow = createWorkflow(
  "manage-pricing-rules",
  (input: Input) => new WorkflowResponse(managePricingRulesStep(input))
)
