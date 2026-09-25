import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"

export type QuantityTier = { min_quantity: number; max_quantity: number | null; markup_percentage: number }
type Input = { organization_id?: string | null; supplier_code?: string; markup_percentage?: number; quantity_tiers?: QuantityTier[] }

export function markupForQuantity(rule: any, quantity = 1) {
  const tier = (Array.isArray(rule?.quantity_tiers) ? rule.quantity_tiers : []).find((item: QuantityTier) => quantity >= item.min_quantity && (item.max_quantity === null || quantity <= item.max_quantity))
  return Number(tier?.markup_percentage ?? rule?.markup_percentage ?? 30)
}

export async function resolveMarkupRule(service: any, organizationId?: string | null, supplierCode?: string | null) {
  if (organizationId) {
    const clientRules = await service.listPricingRules(
      { scope_key: `organization:${organizationId}`, status: "active" },
      { take: 1 }
    )
    if (clientRules.length) return clientRules[0]
  }
  if (supplierCode) {
    const supplierRules = await service.listPricingRules(
      { scope_key: `supplier:${supplierCode}`, status: "active" },
      { take: 1 }
    )
    if (supplierRules.length) return supplierRules[0]
  }
  const globalRules = await service.listPricingRules(
    { scope_key: "global", status: "active" },
    { take: 1 }
  )
  return globalRules[0] || { markup_percentage: 30, quantity_tiers: [] }
}

export async function resolveMarkup(service: any, organizationId?: string | null, quantity = 1, supplierCode?: string | null) {
  return markupForQuantity(await resolveMarkupRule(service, organizationId, supplierCode), quantity)
}

const managePricingRulesStep = createStep(
  "manage-pricing-rules",
  async (input: Input, { container }) => {
    const service = container.resolve(MERCHPORTAL_MODULE) as any
    if (input.supplier_code && !["stricker", "midocean", "aodaci"].includes(input.supplier_code)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown supplier")
    }
    if (input.quantity_tiers !== undefined) {
      if (!Array.isArray(input.quantity_tiers) || input.quantity_tiers.length > 20) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use no more than 20 quantity tiers")
      const tiers = [...input.quantity_tiers].sort((a, b) => a.min_quantity - b.min_quantity)
      for (const [index, tier] of tiers.entries()) {
        if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 1 || (tier.max_quantity !== null && (!Number.isInteger(tier.max_quantity) || tier.max_quantity < tier.min_quantity)) || !Number.isFinite(tier.markup_percentage) || tier.markup_percentage < 0 || tier.markup_percentage > 1000 || (index > 0 && (tiers[index - 1].max_quantity === null || tier.min_quantity <= tiers[index - 1].max_quantity!))) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quantity tiers must have valid, non-overlapping ranges and markups between 0 and 1000 percent")
        }
      }
      if (tiers.some((tier, index) => tier.max_quantity === null && index !== tiers.length - 1)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only the last quantity tier may have no maximum")
    }
    if (input.markup_percentage !== undefined || input.quantity_tiers !== undefined) {
      if (input.markup_percentage !== undefined && (
        !Number.isFinite(input.markup_percentage) ||
        input.markup_percentage < 0 ||
        input.markup_percentage > 1000
      )) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Markup must be between 0 and 1000 percent"
        )
      }
      const scopeKey = input.organization_id ? `organization:${input.organization_id}` : input.supplier_code ? `supplier:${input.supplier_code}` : "global"
      const existing = await service.listPricingRules(
        { scope_key: scopeKey },
        { take: 1 }
      )
      const data = {
        scope_key: scopeKey,
        organization_id: input.organization_id || null,
        markup_percentage: input.markup_percentage ?? Number(existing[0]?.markup_percentage ?? 30),
        quantity_tiers: input.quantity_tiers === undefined ? existing[0]?.quantity_tiers ?? null : input.quantity_tiers,
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
