import { fieldValue, normalizedFieldName } from "./catalog-rules"

type AnyObject = Record<string, any>

export type DecorationPosition = {
  id: string
  name: string
  max_width_mm?: number
  max_height_mm?: number
  max_colours?: number
  image_url?: string
  images?: Array<{ variant_color?: string; url: string }>
  size_options?: Array<{
    id: string
    label: string
    width_mm: number
    height_mm: number
    pricing_code?: string
  }>
}

export type DecorationMethod = {
  id: string
  name: string
  positions: DecorationPosition[]
  price_breaks: DecorationPriceBreak[]
  price_ranges?: Array<{
    area_from_cm2?: number
    area_to_cm2?: number
    price_breaks: DecorationPriceBreak[]
  }>
  setup_price_eur?: number
  handling_price_breaks?: DecorationPriceBreak[]
  pricing_type?: string
  next_colour_cost_indicator?: boolean
}

type DecorationPriceBreak = {
  quantity: number
  unit_price_eur: number
  next_colour_price_eur?: number
}

type PricingIndex = {
  candidates: AnyObject[]
  byId: Map<string, AnyObject[]>
}

const pricingCache = new WeakMap<object, PricingIndex>()

function number(value: unknown) {
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function key(object: AnyObject, names: string[]) {
  const entries = new Map(Object.entries(object).map(([name, value]) => [normalizedFieldName(name), value]))
  for (const name of names) {
    const value = entries.get(normalizedFieldName(name))
    if (value !== undefined) return value
  }
}

function printingArea(value: unknown) {
  if (value && typeof value === "object") {
    return {
      width: number(key(value as AnyObject, ["width_mm", "width", "max_width_mm"])),
      height: number(key(value as AnyObject, ["height_mm", "height", "max_height_mm"])),
    }
  }
  if (typeof value !== "string") return {}
  const dimensions = value.match(/([\d.,]+)\s*(?:x|×)\s*([\d.,]+)/iu)
  return dimensions ? { width: number(dimensions[1]), height: number(dimensions[2]) } : {}
}

function centimetreArea(value: unknown) {
  const area = printingArea(value)
  return {
    width: area.width === undefined ? undefined : area.width * 10,
    height: area.height === undefined ? undefined : area.height * 10,
  }
}

function positionImages(candidate: AnyObject) {
  const imageRows = key(candidate, ["images", "position_images", "printing_images"])
  if (!Array.isArray(imageRows)) return []
  return imageRows.flatMap((image) => {
    if (!image || typeof image !== "object") return []
    const url = fieldValue(image, ["print_position_image_with_area", "image_url", "url", "image"])
    if (!url) return []
    return [{
      variant_color: fieldValue(image, ["variant_color", "color_description", "colour_description", "color_code"]),
      url,
    }]
  })
}

function directValue(object: AnyObject, names: string[]) {
  const found = key(object, names)
  return found !== undefined && found !== null && typeof found !== "object" && String(found).trim() ? String(found).trim() : undefined
}

function objects(value: unknown, output: AnyObject[] = []) {
  if (Array.isArray(value)) value.forEach((child) => objects(child, output))
  else if (value && typeof value === "object") {
    output.push(value as AnyObject)
    Object.values(value as AnyObject).forEach((child) => objects(child, output))
  }
  return output
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "standard"
  )
}

function priceBreaks(candidate: AnyObject) {
  const breaks: DecorationPriceBreak[] = []
  for (const item of objects(candidate)) {
    const quantity = number(key(item, ["quantity", "minimum_quantity", "min_quantity", "from_quantity", "qty"]))
    const price = number(key(item, ["printing_price", "print_price", "unit_price", "price_eur", "price"]))
    if (quantity !== undefined && price !== undefined && quantity > 0 && price >= 0) {
      const nextColour = number(key(item, ["next_price", "next_colour_price"]))
      breaks.push({
        quantity: Math.floor(quantity),
        unit_price_eur: price,
        ...(nextColour === undefined ? {} : { next_colour_price_eur: nextColour }),
      })
    }
  }
  return breaks.filter((item, index, all) => all.findIndex((other) => other.quantity === item.quantity) === index).sort((left, right) => left.quantity - right.quantity)
}

function priceRanges(candidate: AnyObject) {
  return objects(candidate)
    .filter((item) => Array.isArray(key(item, ["scales"])))
    .map((item) => ({
      area_from_cm2: number(key(item, ["area_from", "area_from_cm2"])),
      area_to_cm2: number(key(item, ["area_to", "area_to_cm2"])),
      price_breaks: priceBreaks(item),
    }))
    .filter((item) => item.price_breaks.length)
}

export function normalizeDecorationOptions(payloads: unknown[], fallbackMethods: string[] = [], pricingPayloads: unknown[] = []) {
  const methods = new Map<string, DecorationMethod>()
  const cacheKey = pricingPayloads.find((payload) => payload && typeof payload === "object") as object | undefined
  let pricingIndex = cacheKey ? pricingCache.get(cacheKey) : undefined
  if (!pricingIndex) {
    const candidates = pricingPayloads.flatMap((payload) => objects(payload))
    const byId = new Map<string, AnyObject[]>()
    for (const candidate of candidates) {
      const id = directValue(candidate, ["id", "technique_id", "service_code", "servicecode", "table_code", "tablecode", "table_full_code", "tablefullcode"])
      if (!id) continue
      const key = id.toLowerCase()
      const bucket = byId.get(key)
      if (bucket) bucket.push(candidate)
      else byId.set(key, [candidate])
    }
    pricingIndex = { candidates, byId }
    if (cacheKey) pricingCache.set(cacheKey, pricingIndex)
  }
  const pricingCandidates = pricingIndex.candidates
  const matchingPrices = (methodId: string) => {
    const right = methodId.toLowerCase()
    const exact = pricingIndex.byId.get(right)
    if (exact?.length) return exact
    return pricingCandidates.filter((candidate) => {
      const candidateId = directValue(candidate, ["id", "technique_id", "service_code", "servicecode", "table_code", "tablecode", "table_full_code", "tablefullcode"])
      if (!candidateId) return false
      const left = candidateId.toLowerCase()
      return left.startsWith(right) || right.startsWith(left)
    })
  }
  const add = (methodName: string, methodId: string, position: DecorationPosition, candidate: AnyObject) => {
    const id = methodId || slug(methodName)
    const current = methods.get(id) || {
      id,
      name: methodName || id,
      positions: [],
      price_breaks: [],
    }
    const existingPosition = current.positions.find((item) => item.id === position.id)
    if (!existingPosition) current.positions.push(position)
    else {
      existingPosition.max_width_mm = Math.max(existingPosition.max_width_mm || 0, position.max_width_mm || 0) || undefined
      existingPosition.max_height_mm = Math.max(existingPosition.max_height_mm || 0, position.max_height_mm || 0) || undefined
      existingPosition.max_colours = Math.max(existingPosition.max_colours || 0, position.max_colours || 0) || undefined
      existingPosition.image_url ||= position.image_url
      existingPosition.images = [...(existingPosition.images || []), ...(position.images || [])].filter((item, index, all) => all.findIndex((other) => other.url === item.url && other.variant_color === item.variant_color) === index)
      existingPosition.size_options = [...(existingPosition.size_options || []), ...(position.size_options || [])].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    }
    const matchedPrices = matchingPrices(id)
    const priceSources = matchedPrices.length ? matchedPrices : [candidate]
    const prices = priceSources.flatMap(priceBreaks)
    if (prices.length) {
      current.price_breaks = prices.filter((item, index, all) => all.findIndex((other) => other.quantity === item.quantity) === index).sort((left, right) => left.quantity - right.quantity)
    }
    const ranges = priceSources.flatMap(priceRanges)
    if (ranges.length) current.price_ranges = ranges
    const setup = number(priceSources.map((source) => key(source, ["setup", "setup_price", "setup_cost", "handling_cost", "handlingcost"])).find((value) => number(value) !== undefined))
    if (setup !== undefined) current.setup_price_eur = setup
    current.pricing_type = current.pricing_type || priceSources.map((source) => fieldValue(source, ["pricing_type", "price_by_color", "pricebycolor"])).find(Boolean)
    const nextColourIndicator = priceSources.map((source) => fieldValue(source, ["next_colour_cost_indicator"])).find(Boolean)
    if (nextColourIndicator) {
      current.next_colour_cost_indicator = /^(x|true|yes|1)$/i.test(nextColourIndicator)
    }
    const manipulationCode = payloads.map((payload) => fieldValue(payload, ["print_manipulation", "printmanipulation", "handling_cost_code", "handlingcostcode"])).find(Boolean)
    if (manipulationCode) {
      const manipulation = pricingIndex.byId.get(manipulationCode.toLowerCase())?.[0] || pricingCandidates.find((source) => directValue(source, ["id", "code", "manipulation_id"])?.toLowerCase() === manipulationCode.toLowerCase())
      const handlingBreaks = manipulation ? priceBreaks(manipulation) : []
      if (handlingBreaks.length) current.handling_price_breaks = handlingBreaks
    }
    methods.set(id, current)
  }

  const handled = new WeakSet<object>()
  for (const candidate of payloads.flatMap((payload) => objects(payload))) {
    const component = fieldValue(candidate, ["component", "product_component"])
    const location = fieldValue(candidate, ["location", "customization_location"])
    const tableCode = fieldValue(candidate, ["table_code", "tablecode"])
    const strickerMethodName = fieldValue(candidate, ["customization_type_name", "customization_type", "technique"])
    if (component && location && tableCode && strickerMethodName) {
      const locationArea = printingArea(key(candidate, ["location_max_printing_area_mm"]))
      const tableArea = centimetreArea(key(candidate, ["table_max_area_cm"]))
      const placeholder = (tableArea.width || 0) >= 9900 && (tableArea.height || 0) >= 9900
      const width = placeholder ? locationArea.width : Math.min(tableArea.width || locationArea.width || 0, locationArea.width || tableArea.width || 0)
      const height = placeholder ? locationArea.height : Math.min(tableArea.height || locationArea.height || 0, locationArea.height || tableArea.height || 0)
      const positionName = fieldValue(candidate, ["composed_location"]) || `${component} - ${location}`
      const positionId = slug(`${component}-${location}`)
      const image = fieldValue(candidate, ["area_image", "location_image"])
      const methodId = tableCode.split("-")[0] || slug(strickerMethodName)
      add(strickerMethodName, methodId, {
        id: positionId,
        name: positionName,
        max_width_mm: locationArea.width,
        max_height_mm: locationArea.height,
        max_colours: number(key(candidate, ["max_colors", "max_colours"])),
        image_url: image,
        images: image ? [{ variant_color: fieldValue(candidate, ["color_desc_1", "color_description", "color_code"]), url: image }] : undefined,
        size_options: width && height ? [{
          id: fieldValue(candidate, ["table_code_option"]) || tableCode,
          label: `${(width / 10).toFixed(1)} × ${(height / 10).toFixed(1)} cm`,
          width_mm: width,
          height_mm: height,
          pricing_code: fieldValue(candidate, ["table_code_option"]) || tableCode,
        }] : undefined,
      }, candidate)
      handled.add(candidate)
      continue
    }
    if (handled.has(candidate)) continue
    const positionName = fieldValue(candidate, ["product_component_locations", "product_composed_locations", "product_component_default_location", "print_position_type", "print_position_description", "position_name", "position_description", "position", "location_name", "location_description", "location", "customization_area", "area"])
    const techniques = key(candidate, ["customization_types", "customization_table_options", "printing_techniques", "customization_techniques"])
    const area = printingArea(key(candidate, ["location_max_printing_area_mm", "product_component_default_location_area_mm", "max_printing_area_mm"]))
    const supplierPositionImages = positionImages(candidate)
    if (positionName && Array.isArray(techniques)) {
      for (const technique of techniques) {
        if (!technique || typeof technique !== "object") continue
        const techniqueArea = printingArea(key(technique as AnyObject, ["location_max_printing_area_mm", "product_component_default_location_area_mm", "max_printing_area_mm"]))
        const methodName = fieldValue(technique, ["name", "description", "technique_name", "customization_type", "customisation_type", "customizationtype", "customisationtype"]) || fieldValue(technique, ["id"]) || "Branding"
        const methodId = fieldValue(technique, ["id", "code", "service_code", "servicecode"]) || slug(methodName)
        add(
          methodName,
          methodId,
          {
            id: fieldValue(candidate, ["position_id", "location_id", "location_code", "id"]) || slug(positionName),
            name: positionName,
            max_width_mm: number(key(candidate, ["max_print_size_width", "max_width_mm", "width_mm", "width"])) ?? techniqueArea.width ?? area.width,
            max_height_mm: number(key(candidate, ["max_print_size_height", "max_height_mm", "height_mm", "height"])) ?? techniqueArea.height ?? area.height,
            max_colours: number(key(technique, ["max_number_of_colours", "max_printing_colours", "max_colours", "max_colors", "colours", "colors"])),
            image_url: supplierPositionImages[0]?.url || fieldValue(candidate, ["image_url", "customization_default_printing_lines", "printing_line", "location_image", "url"]),
            images: supplierPositionImages,
          },
          technique,
        )
      }
      continue
    }

    const methodName = fieldValue(candidate, ["customization_type_name", "customization_default_type", "technique_name", "technique_description", "service_name", "service_description", "printing_technique", "customization_type", "technique"])
    if (methodName && positionName) {
      add(
        methodName,
        fieldValue(candidate, ["technique_id", "service_code", "servicecode", "table_full_code", "tablefullcode", "code"]) || slug(methodName),
        {
          id: fieldValue(candidate, ["position_id", "location_id", "location_code"]) || slug(positionName),
          name: positionName,
          max_width_mm: number(key(candidate, ["max_print_size_width", "max_width_mm", "width_mm"])) ?? area.width,
          max_height_mm: number(key(candidate, ["max_print_size_height", "max_height_mm", "height_mm"])) ?? area.height,
          max_colours: number(key(candidate, ["max_number_of_colours", "max_printing_colours", "max_colours", "max_colors", "colours", "colors"])),
          image_url: supplierPositionImages[0]?.url || fieldValue(candidate, ["image_url", "customization_default_printing_lines", "printing_line", "location_image", "url"]),
          images: supplierPositionImages,
        },
        candidate,
      )
    }
  }

  for (const methodName of fallbackMethods) {
    const id = slug(methodName)
    if (!methods.has(id))
      methods.set(id, {
        id,
        name: methodName,
        positions: [{ id: "standard", name: "Standard position" }],
        price_breaks: [],
      })
  }
  return [...methods.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function decorationPrice(method: DecorationMethod | undefined, quantity: number, options: { colours?: number; width_mm?: number; height_mm?: number; color_code?: string } = {}) {
  if (!method) return { unit: 0, handling: 0, setup: 0, pending: false }
  const pricingType = method.pricing_type?.toLowerCase() || ""
  const needsArea = pricingType.includes("area")
  const areaCm2 = options.width_mm && options.height_mm ? (options.width_mm * options.height_mm) / 100 : undefined
  const range = method.price_ranges
    ?.filter((item) => {
      if (areaCm2 === undefined) return false
      const from = item.area_from_cm2 || 0
      const to = item.area_to_cm2 || Number.POSITIVE_INFINITY
      return areaCm2 >= from && areaCm2 <= to
    })
    .sort((left, right) => (right.area_from_cm2 || 0) - (left.area_from_cm2 || 0))[0]
  const breaks = range?.price_breaks?.length ? range.price_breaks : method.price_breaks
  if (!breaks.length || (needsArea && areaCm2 === undefined)) return { unit: 0, handling: 0, setup: method?.setup_price_eur || 0, pending: true }
  const selected = [...breaks].filter((item) => item.quantity <= quantity).sort((left, right) => right.quantity - left.quantity)[0] || breaks[0]
  const colours = Math.max(1, Math.floor(options.colours || 1))
  const byColour = pricingType.includes("colour") || pricingType.includes("color")
  const whiteTextileCodes = new Set(["AS", "WW", "WD", "WH", "NB", "NW", "RH"])
  const pricedColours = method.id.toUpperCase() === "ST" && options.color_code && !whiteTextileCodes.has(options.color_code.toUpperCase()) ? colours + 1 : colours
  const unit = byColour ? (method.next_colour_cost_indicator && selected.next_colour_price_eur !== undefined ? selected.unit_price_eur + selected.next_colour_price_eur * (pricedColours - 1) : selected.unit_price_eur * pricedColours) : selected.unit_price_eur
  const handlingBreaks = method.handling_price_breaks || []
  const handling = [...handlingBreaks].filter((item) => item.quantity <= quantity).sort((left, right) => right.quantity - left.quantity)[0]?.unit_price_eur || handlingBreaks[0]?.unit_price_eur || 0
  return {
    unit,
    handling,
    setup: (method.setup_price_eur || 0) * (byColour ? colours : 1),
    pending: false,
  }
}
