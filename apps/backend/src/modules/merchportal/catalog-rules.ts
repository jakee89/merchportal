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

export function fieldValues(object: unknown, keys: string[], output = new Set<string>()): string[] {
  if (Array.isArray(object)) {
    object.forEach((item) => fieldValues(item, keys, output))
  } else if (object && typeof object === "object") {
    const accepted = new Set(keys.map((key) => key.toLowerCase()))
    for (const [key, child] of Object.entries(object as ObjectValue)) {
      if (accepted.has(key.toLowerCase())) {
        const values = Array.isArray(child) ? child : [child]
        for (const item of values) {
          if (typeof item !== "object" && item !== undefined && item !== null) {
            String(item)
              .split(/[,;|]/)
              .map((value) => value.trim())
              .filter(Boolean)
              .forEach((value) => output.add(value))
          }
        }
      }
      fieldValues(child, keys, output)
    }
  }
  return [...output]
}

export function supplierCategory(payload: unknown) {
  return fieldValue(payload, ["category_level3", "category_level_3", "sub_type_description", "subtypedescription", "category", "category_name", "product_class", "family", "product_family", "subcategory"]) || "Uncategorized"
}

export function productAttributes(payload: unknown) {
  const leadTime = fieldValue(payload, ["lead_time", "delivery_time", "production_time", "delivery_days", "leadtime"])
  const printValue = fieldValue(payload, ["print_methods", "printing_methods", "printing_techniques", "printing_technique", "printingTechnique", "decoration_methods", "decoration", "print_method"])
  const printMethods = printValue
    ? printValue
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const sustainabilityText = fieldValue(payload, ["sustainable", "sustainability", "eco", "eco_friendly", "recycled", "material"]) || ""
  const materials = fieldValues(payload, ["material", "materials", "material_description", "materialdescription"])
    .filter((item) => !/^(true|false|yes|no)$/i.test(item))
    .slice(0, 20)
  const keywords = fieldValues(payload, ["keywords", "product_keywords", "tags", "features"]).slice(0, 40)
  return {
    lead_time: leadTime,
    print_methods: [...new Set(printMethods)].slice(0, 20),
    materials,
    brand: fieldValue(payload, ["brand", "brand_name"]),
    country_of_origin: fieldValue(payload, ["country_of_origin", "countryoforigin", "origin_country"]),
    dimensions: fieldValue(payload, ["dimensions", "combined_sizes", "combinedsizes", "product_dimensions"]),
    weight: fieldValue(payload, ["weight", "gross_weight", "net_weight", "product_weight"]),
    keywords,
    sustainable: /true|yes|eco|recycl|organic|sustainab|bamboo|cork/i.test(`${sustainabilityText} ${materials.join(" ")}`),
  }
}

export function sellingPrice(cost: number, markupPercentage: number) {
  return Math.round(cost * (1 + markupPercentage / 100) * 100) / 100
}
