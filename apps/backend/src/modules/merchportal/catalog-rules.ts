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

const categoryRules: Array<[RegExp, string, number]> = [
  [/backpack|rucksack|bag|tote|luggage/i, "Bags / Backpacks", 0.97],
  [/bottle|mug|cup|tumbler|drink/i, "Drinkware", 0.97],
  [/shirt|polo|hood|sweat|jacket|textile|apparel/i, "Apparel", 0.95],
  [/pen|pencil|writing/i, "Writing Instruments", 0.96],
  [/notebook|notepad|office|stationery/i, "Office / Notebooks", 0.94],
  [/umbrella/i, "Umbrellas", 0.99],
  [/charger|speaker|headphone|electronic|usb|power bank/i, "Technology", 0.95],
  [/keyring|lanyard|badge/i, "Events / Lanyards", 0.93],
  [/sport|fitness|outdoor/i, "Sport & Outdoor", 0.91],
  [/home|kitchen/i, "Home & Living", 0.9],
]

export function suggestCategory(input: string) {
  const match = categoryRules.find(([pattern]) => pattern.test(input))
  return match
    ? { category: match[1], confidence: match[2] }
    : { category: "General Merchandise", confidence: 0.7 }
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
