import { markedUpUnitPrice } from "./catalog-rules"
import { markupForQuantity } from "../../workflows/manage-pricing-rules"

type PriceBreak = { quantity: number; price_eur: number }

export function plainProductPriceBreaks(baseCost: number | undefined, supplierBreaks: PriceBreak[] | undefined, rule: any) {
  const hasSupplierBreaks = (supplierBreaks || []).some((item) => Number.isInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.price_eur) && item.price_eur > 0)
  const supplierPrices = [...new Map((supplierBreaks || [])
    .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100000 && Number.isFinite(item.price_eur) && item.price_eur > 0)
    .map((item) => [item.quantity, item.price_eur])).entries()]
    .sort((left, right) => left[0] - right[0])
  if (hasSupplierBreaks && !supplierPrices.length) return []
  if (!supplierPrices.length && !(baseCost !== undefined && Number.isFinite(baseCost) && baseCost > 0)) return []

  const firstQuantity = supplierPrices[0]?.[0] || 1
  const boundaries = new Set<number>([firstQuantity, ...supplierPrices.map(([quantity]) => quantity)])
  for (const tier of Array.isArray(rule?.quantity_tiers) ? rule.quantity_tiers : []) {
    const minimum = Number(tier.min_quantity)
    const afterMaximum = tier.max_quantity === null ? undefined : Number(tier.max_quantity) + 1
    if (Number.isInteger(minimum) && minimum >= firstQuantity && minimum <= 100000) boundaries.add(minimum)
    if (afterMaximum !== undefined && Number.isInteger(afterMaximum) && afterMaximum >= firstQuantity && afterMaximum <= 100000) boundaries.add(afterMaximum)
  }

  const result: PriceBreak[] = []
  for (const quantity of [...boundaries].sort((left, right) => left - right)) {
    const supplierCost = [...supplierPrices].reverse().find(([minimum]) => minimum <= quantity)?.[1] ?? baseCost
    if (supplierCost === undefined || !Number.isFinite(supplierCost) || supplierCost <= 0) continue
    const price_eur = markedUpUnitPrice(supplierCost, markupForQuantity(rule, quantity))
    if (result.at(-1)?.price_eur !== price_eur) result.push({ quantity, price_eur })
  }
  return result
}

export function lowestPlainProductPrice(breaks: PriceBreak[]) {
  return breaks.reduce<PriceBreak | undefined>((lowest, current) => !lowest || current.price_eur < lowest.price_eur ? current : lowest, undefined)
}
