import { fieldValue } from "./catalog-rules"

type AnyObject = Record<string, any>

export type DecorationPosition = {
  id: string
  name: string
  max_width_mm?: number
  max_height_mm?: number
  max_colours?: number
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
  pricing_type?: string
  next_colour_cost_indicator?: boolean
}

type DecorationPriceBreak = {
  quantity: number
  unit_price_eur: number
  next_colour_price_eur?: number
}

function number(value: unknown) {
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function key(object: AnyObject, names: string[]) {
  const accepted = new Set(names.map((name) => name.toLowerCase()))
  return Object.entries(object).find(([name]) => accepted.has(name.toLowerCase()))?.[1]
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
  const pricingCandidates = pricingPayloads.flatMap((payload) => objects(payload))
  const matchingPrices = (methodId: string) =>
    pricingCandidates.filter((candidate) => {
      const candidateId = fieldValue(candidate, ["id", "technique_id", "service_code", "servicecode", "table_code", "tablecode", "table_full_code", "tablefullcode"])
      if (!candidateId) return false
      const left = candidateId.toLowerCase()
      const right = methodId.toLowerCase()
      return left === right || left.startsWith(right) || right.startsWith(left)
    })
  const add = (methodName: string, methodId: string, position: DecorationPosition, candidate: AnyObject) => {
    const id = methodId || slug(methodName)
    const current = methods.get(id) || {
      id,
      name: methodName || id,
      positions: [],
      price_breaks: [],
    }
    if (!current.positions.some((item) => item.id === position.id)) current.positions.push(position)
    const priceSources = [candidate, ...matchingPrices(id)]
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
    methods.set(id, current)
  }

  for (const candidate of payloads.flatMap((payload) => objects(payload))) {
    const positionName = fieldValue(candidate, ["print_position_type", "print_position_description", "position_name", "position_description", "position", "location_name", "location_description", "location", "customization_area", "customisation_area", "area"])
    const techniques = key(candidate, ["printing_techniques", "customization_techniques", "customisation_techniques"])
    if (positionName && Array.isArray(techniques)) {
      for (const technique of techniques) {
        if (!technique || typeof technique !== "object") continue
        const methodName = fieldValue(technique, ["name", "description", "technique_name", "customization_type", "customisation_type", "customizationtype", "customisationtype"]) || fieldValue(technique, ["id"]) || "Branding"
        const methodId = fieldValue(technique, ["id", "code", "service_code", "servicecode"]) || slug(methodName)
        add(
          methodName,
          methodId,
          {
            id: fieldValue(candidate, ["position_id", "location_id", "location_code", "id"]) || slug(positionName),
            name: positionName,
            max_width_mm: number(key(candidate, ["max_print_size_width", "max_width_mm", "width_mm", "width"])),
            max_height_mm: number(key(candidate, ["max_print_size_height", "max_height_mm", "height_mm", "height"])),
            max_colours: number(key(technique, ["max_colours", "max_colors", "colours", "colors"])),
          },
          technique,
        )
      }
      continue
    }

    const methodName = fieldValue(candidate, ["technique_name", "technique_description", "service_name", "service_description", "printing_technique", "customization_type", "customisation_type", "customizationtype", "customisationtype", "customizationtypename", "customisationtypename", "technique"])
    if (methodName && positionName) {
      add(
        methodName,
        fieldValue(candidate, ["technique_id", "service_code", "servicecode", "table_full_code", "tablefullcode", "code"]) || slug(methodName),
        {
          id: fieldValue(candidate, ["position_id", "location_id", "location_code"]) || slug(positionName),
          name: positionName,
          max_width_mm: number(key(candidate, ["max_print_size_width", "max_width_mm", "width_mm"])),
          max_height_mm: number(key(candidate, ["max_print_size_height", "max_height_mm", "height_mm"])),
          max_colours: number(key(candidate, ["max_colours", "max_colors", "colours", "colors"])),
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

export function decorationPrice(method: DecorationMethod | undefined, quantity: number, options: { colours?: number; width_mm?: number; height_mm?: number } = {}) {
  if (!method) return { unit: 0, setup: 0, pending: false }
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
  if (!breaks.length || (needsArea && areaCm2 === undefined)) return { unit: 0, setup: method?.setup_price_eur || 0, pending: true }
  const selected = [...breaks].filter((item) => item.quantity <= quantity).sort((left, right) => right.quantity - left.quantity)[0] || breaks[0]
  const colours = Math.max(1, Math.floor(options.colours || 1))
  const byColour = pricingType.includes("colour") || pricingType.includes("color")
  const unit = byColour ? (method.next_colour_cost_indicator && selected.next_colour_price_eur !== undefined ? selected.unit_price_eur + selected.next_colour_price_eur * (colours - 1) : selected.unit_price_eur * colours) : selected.unit_price_eur
  return {
    unit,
    setup: (method.setup_price_eur || 0) * (byColour ? colours : 1),
    pending: false,
  }
}
