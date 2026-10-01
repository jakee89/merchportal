import type { Selection } from "./types"

export function selectionKey(item: Pick<Selection, "product_id" | "sku">) {
  return `${item.product_id}:${item.sku}`
}

export function comparisonSelection(value: unknown): Selection[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((item) => {
      if (
        !item ||
        typeof item.product_id !== "string" ||
        !/^prod_[a-z0-9]+$/i.test(item.product_id) ||
        typeof item.sku !== "string" ||
        !item.sku ||
        item.sku.length > 100 ||
        typeof item.name !== "string" ||
        item.name.length > 500
      )
        return false
      const key = selectionKey(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
    .map(({ product_id, sku, name }) => ({ product_id, sku, name }))
}

export function validQuantity(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 100000
}
