type ObjectValue = Record<string, unknown>

export function fieldValue(object: unknown, keys: string[]): string | undefined {
  if (!object || typeof object !== "object") return
  const accepted = new Set(keys.map((key) => key.toLowerCase()))
  for (const [key, found] of Object.entries(object as ObjectValue)) {
    if (accepted.has(key.toLowerCase()) && found !== undefined && found !== null) {
      if (Array.isArray(found)) {
        const joined = found.filter((item) => typeof item === "string").join(", ")
        if (joined) return joined
      } else if (typeof found !== "object" && String(found).trim()) {
        return String(found).trim()
      }
    }
  }
  for (const child of Object.values(object as ObjectValue)) {
    const found = fieldValue(child, keys)
    if (found) return found
  }
}

export function supplierCategory(payload: unknown) {
  return fieldValue(payload, [
    "product_class",
    "category_level3",
    "category_level_3",
    "category",
    "category_name",
    "family",
    "product_family",
    "subcategory",
  ]) || "Uncategorized"
}

export function productAttributes(payload: unknown) {
  const leadTime = fieldValue(payload, [
    "lead_time",
    "delivery_time",
    "production_time",
    "delivery_days",
    "leadtime",
  ])
  const printValue = fieldValue(payload, [
    "print_methods",
    "printing_methods",
    "printing_techniques",
    "printing_technique",
    "printingTechnique",
    "decoration_methods",
    "decoration",
    "print_method",
  ])
  const printMethods = printValue
    ? printValue.split(/[,;|]/).map((item) => item.trim()).filter(Boolean)
    : []
  const sustainabilityText = fieldValue(payload, [
    "sustainable",
    "sustainability",
    "eco",
    "eco_friendly",
    "recycled",
    "material",
  ]) || ""
  return {
    lead_time: leadTime,
    print_methods: [...new Set(printMethods)].slice(0, 20),
    sustainable: /true|yes|eco|recycl|organic|sustainab|bamboo|cork/i.test(
      sustainabilityText
    ),
  }
}

export function sellingPrice(cost: number, markupPercentage: number) {
  return Math.round(cost * (1 + markupPercentage / 100) * 100) / 100
}
