type ObjectValue = Record<string, unknown>

export function normalizedFieldName(value: string) {
  return value.replace(/[^a-z0-9]/giu, "").toLowerCase()
}

export function fieldValue(object: unknown, keys: string[]): string | undefined {
  if (!object || typeof object !== "object") return
  const entries = new Map(Object.entries(object as ObjectValue).map(([key, found]) => [normalizedFieldName(key), found]))
  for (const requested of keys) {
    const found = entries.get(normalizedFieldName(requested))
    if (found !== undefined && found !== null) {
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
    const accepted = new Set(keys.map(normalizedFieldName))
    for (const [key, child] of Object.entries(object as ObjectValue)) {
      if (accepted.has(normalizedFieldName(key))) {
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
  return fieldValue(payload, ["sub_type_description", "sub_type", "category_level3", "category", "category_name", "product_class", "product_family", "family", "type_description", "type"]) || "Uncategorized"
}

export function categoryHierarchy(payload: unknown) {
  return [
    fieldValue(payload, ["category_level1", "type_description", "type"]),
    fieldValue(payload, ["category_level2", "sub_type_description", "sub_type", "subcategory"]),
    fieldValue(payload, ["category_level3", "category", "category_name"]),
  ].filter((item, index, all): item is string => Boolean(item) && all.indexOf(item) === index)
}

export function productSpecifications(payload: unknown) {
  const fields: Array<[string, string[]]> = [
    ["Material", ["material_description", "materials", "material", "composition"]],
    ["Dimensions", ["combined_sizes", "product_dimensions", "dimensions"]],
    ["Width", ["width_mm", "product_width", "width"]],
    ["Height", ["height_mm", "product_height", "height"]],
    ["Length", ["length_mm", "product_length", "length"]],
    ["Diameter", ["diameter_mm", "diameter"]],
    ["Capacity", ["capacity_ml", "capacity"]],
    ["Net weight", ["net_weight", "product_weight", "weight"]],
    ["Gross weight", ["gross_weight"]],
    ["Country of origin", ["country_of_origin", "origin_country"]],
    ["Tariff code", ["taric_code", "tariff_code", "customs_code", "commodity_code"]],
    ["EAN", ["ean", "ean13", "barcode", "gtin"]],
    ["Units per carton", ["units_per_carton", "carton_quantity", "master_carton_quantity"]],
    ["Inner carton", ["inner_carton_quantity", "inner_quantity"]],
    ["Carton dimensions", ["carton_dimensions", "master_carton_dimensions"]],
    ["Carton weight", ["carton_weight", "carton_gross_weight"]],
    ["Certificates", ["certificates", "certifications"]],
    ["Recycled content", ["recycled_content", "recycled_percentage"]],
    ["Properties", ["properties", "product_indicators", "labels"]],
  ]
  return fields.flatMap(([label, keys]) => {
    const value = fieldValue(payload, keys)
    return value ? [{ label, value }] : []
  })
}

export function productAttributes(payload: unknown) {
  const leadTime = fieldValue(payload, ["lead_time", "delivery_time", "production_time", "delivery_days", "leadtime"])
  const printValue = fieldValue(payload, ["customization_types", "customization_type_name", "print_methods", "printing_methods", "printing_techniques", "printing_technique", "decoration_methods", "decoration", "print_method"])
  const printMethods = printValue
    ? printValue
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const sustainabilityText = fieldValue(payload, ["sustainable", "sustainability", "sustainability_certificate", "eco", "eco_friendly", "recycled", "material", "composition"]) || ""
  const materials = fieldValues(payload, ["material", "materials", "material_description", "composition"])
    .filter((item) => !/^(true|false|yes|no)$/i.test(item))
    .slice(0, 20)
  const keywords = fieldValues(payload, ["keywords", "product_keywords", "tags", "features", "properties"]).slice(0, 40)
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

export function markedUpPrintUnitPrice(cost: number, markupPercentage: number) {
  return Math.round(cost * (1 + markupPercentage / 100) * 1_000_000) / 1_000_000
}
