import { fieldValue, normalizedFieldName } from "./catalog-rules"

type AnyObject = Record<string, any>

export type DecorationPosition = {
  id: string
  name: string
  max_width_mm?: number
  max_height_mm?: number
  max_colours?: number
  handling_price_eur?: number
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
  colour_mode?: "full_colour" | "spot_colour" | "colourless"
  price_tables?: DecorationPriceTable[]
}

type DecorationPriceBreak = {
  quantity: number
  unit_price_eur: number
  next_colour_price_eur?: number
}

type DecorationPriceTable = {
  code: string
  option_code?: string
  max_colours?: number
  max_area_cm2?: number
  max_stitches?: number
  price_by_color: boolean
  price_by_area: boolean
  price_by_stitches: boolean
  price_breaks: DecorationPriceBreak[]
}

type PricingIndex = {
  candidates: AnyObject[]
  byId: Map<string, AnyObject[]>
  byOption: Map<string, AnyObject>
  matches: Map<string, AnyObject[]>
  prepared: Map<string, { tables: DecorationPriceTable[]; prices: DecorationPriceBreak[]; ranges: ReturnType<typeof priceRanges>[] }>
}

const pricingCache = new WeakMap<object, PricingIndex>()

function number(value: unknown) {
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function quantityNumber(value: unknown) {
  const normalized = typeof value === "string" && /^\d{1,3}(?:\.\d{3})+$/u.test(value.trim())
    ? value.replace(/\./gu, "")
    : value
  return number(normalized)
}

function key(object: AnyObject, names: string[]) {
  const entries = new Map(Object.entries(object).map(([name, value]) => [normalizedFieldName(name), value]))
  for (const name of names) {
    const value = entries.get(normalizedFieldName(name))
    if (value !== undefined) return value
  }
}

function boolean(value: unknown) {
  return value === true || /^(true|yes|1|x)$/iu.test(String(value || "").trim())
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
  const entries = new Map(Object.entries(candidate).map(([name, value]) => [normalizedFieldName(name), value]))
  for (let index = 1; index <= 15; index += 1) {
    const quantity = quantityNumber(entries.get(`minqt${index}`))
    const price = number(entries.get(`price${index}`))
    if (quantity !== undefined && price !== undefined && quantity > 0 && price >= 0) {
      breaks.push({ quantity: Math.floor(quantity), unit_price_eur: price })
    }
  }
  for (const item of objects(candidate)) {
    const quantity = quantityNumber(key(item, ["quantity", "minimum_quantity", "min_quantity", "from_quantity", "qty"]))
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

function normalizedPriceTables(sources: AnyObject[]): DecorationPriceTable[] {
  return sources.flatMap((source) => {
    const code = directValue(source, ["table_code", "tablecode"])
    const optionCode = directValue(source, ["table_code_option", "tablecodeoption"])
    if (!code && !optionCode) return []
    const breaks = priceBreaks(source)
    if (!breaks.length) return []
    return [{
      code: code || optionCode || "",
      option_code: optionCode,
      max_colours: number(key(source, ["max_colors", "max_colours"])),
      max_area_cm2: number(key(source, ["table_max_area_cm2", "max_area_cm2"])),
      max_stitches: number(key(source, ["max_stitches", "maxstitches"])),
      price_by_color: boolean(key(source, ["price_by_color", "pricebycolor"])),
      price_by_area: boolean(key(source, ["price_by_area", "pricebyarea"])),
      price_by_stitches: boolean(key(source, ["price_by_stitches", "pricebystitches"])),
      price_breaks: breaks,
    }]
  }).filter((table, index, all) => all.findIndex((other) => other.code === table.code && other.option_code === table.option_code) === index)
}

function colourMode(name: string, sources: AnyObject[]) {
  const label = name.toLowerCase()
  if (sources.some((source) => boolean(key(source, ["price_by_color", "pricebycolor"])))) return "spot_colour" as const
  if (sources.some((source) => String(key(source, ["table_code_option", "tablecodeoption"]) || "").toUpperCase().endsWith("-F")) || /full colou?r|digital|dtf|sublimation|uv print|doming|inlay/iu.test(label)) return "full_colour" as const
  if (/laser|engraving|deboss|emboss|etching|embroider/iu.test(label)) return "colourless" as const
  return "spot_colour" as const
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

export function normalizeDecorationOptions(payloads: unknown[], _fallbackMethods: string[] = [], pricingPayloads: unknown[] = []) {
  const methods = new Map<string, DecorationMethod>()
  const cacheKey = pricingPayloads.find((payload) => payload && typeof payload === "object") as object | undefined
  let pricingIndex = cacheKey ? pricingCache.get(cacheKey) : undefined
  if (!pricingIndex) {
    const candidates = pricingPayloads.flatMap((payload) => objects(payload))
    const byId = new Map<string, AnyObject[]>()
    const byOption = new Map<string, AnyObject>()
    for (const candidate of candidates) {
      const optionCode = directValue(candidate, ["table_code_option", "tablecodeoption"])
      if (optionCode && !byOption.has(optionCode)) byOption.set(optionCode, candidate)
      const id = directValue(candidate, ["id", "technique_id", "service_code", "servicecode", "table_code", "tablecode", "table_full_code", "tablefullcode"])
      if (!id) continue
      const key = id.toLowerCase()
      const bucket = byId.get(key)
      if (bucket) bucket.push(candidate)
      else byId.set(key, [candidate])
    }
    pricingIndex = { candidates, byId, byOption, matches: new Map(), prepared: new Map() }
    if (cacheKey) pricingCache.set(cacheKey, pricingIndex)
  }
  const pricingCandidates = pricingIndex.candidates
  const matchingPrices = (methodId: string) => {
    const right = methodId.toLowerCase()
    const cached = pricingIndex.matches.get(right)
    if (cached) return cached
    const matches = pricingCandidates.filter((candidate) => {
      const candidateIds = [directValue(candidate, ["id", "technique_id", "service_code", "servicecode"]), directValue(candidate, ["table_code", "tablecode"]), directValue(candidate, ["table_code_option", "tablecodeoption"])].filter(Boolean)
      return candidateIds.some((candidateId) => candidateId!.toLowerCase() === right || candidateId!.toLowerCase().startsWith(`${right}-`))
    })
    pricingIndex.matches.set(right, matches)
    return matches
  }
  const manipulationCode = payloads.map((payload) => fieldValue(payload, ["print_manipulation", "printmanipulation", "handling_cost_code", "handlingcostcode"])).find(Boolean)
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
      existingPosition.handling_price_eur = Math.max(existingPosition.handling_price_eur || 0, position.handling_price_eur || 0) || undefined
      existingPosition.image_url ||= position.image_url
      existingPosition.images = [...(existingPosition.images || []), ...(position.images || [])].filter((item, index, all) => all.findIndex((other) => other.url === item.url && other.variant_color === item.variant_color) === index)
      existingPosition.size_options = [...(existingPosition.size_options || []), ...(position.size_options || [])].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    }
    const matchedPrices = matchingPrices(id)
    const priceSources = matchedPrices.length ? matchedPrices : [candidate]
    let prepared = matchedPrices.length ? pricingIndex.prepared.get(id) : undefined
    if (!prepared) {
      prepared = {
        tables: normalizedPriceTables(priceSources),
        prices: priceSources.flatMap(priceBreaks),
        ranges: priceSources.map(priceRanges),
      }
      if (matchedPrices.length) pricingIndex.prepared.set(id, prepared)
    }
    const { tables, prices } = prepared
    if (tables.length) current.price_tables = tables
    if (prices.length) {
      current.price_breaks = prices.filter((item, index, all) => all.findIndex((other) => other.quantity === item.quantity) === index).sort((left, right) => left.quantity - right.quantity)
    }
    const ranges = prepared.ranges.flat()
    if (ranges.length) current.price_ranges = ranges
    const setup = number(priceSources.map((source) => key(source, ["setup", "setup_price", "setup_cost"])).find((value) => number(value) !== undefined))
    if (setup !== undefined) current.setup_price_eur = setup
    current.pricing_type = current.pricing_type || priceSources.map((source) => fieldValue(source, ["pricing_type"])).find(Boolean)
    if (!current.pricing_type) {
      if (priceSources.some((source) => boolean(key(source, ["price_by_color", "pricebycolor"])))) current.pricing_type = "NumberOfColours"
      else if (priceSources.some((source) => boolean(key(source, ["price_by_area", "pricebyarea"])))) current.pricing_type = "AreaRange"
      else if (priceSources.some((source) => boolean(key(source, ["price_by_stitches", "pricebystitches"])))) current.pricing_type = "Stitches"
    }
    current.colour_mode = colourMode(current.name, priceSources)
    const nextColourIndicator = priceSources.map((source) => fieldValue(source, ["next_colour_cost_indicator"])).find(Boolean)
    if (nextColourIndicator) {
      current.next_colour_cost_indicator = /^(x|true|yes|1)$/i.test(nextColourIndicator)
    }
    if (manipulationCode) {
      const manipulation = pricingIndex.byId.get(manipulationCode.toLowerCase())?.[0] || pricingCandidates.find((source) => directValue(source, ["id", "code", "manipulation_id"])?.toLowerCase() === manipulationCode.toLowerCase())
      const handlingBreaks = manipulation ? priceBreaks(manipulation) : []
      if (manipulation && !handlingBreaks.length) {
        const fixedPrice = number(key(manipulation, ["price", "unit_price"]))
        if (fixedPrice !== undefined) handlingBreaks.push({ quantity: 1, unit_price_eur: fixedPrice })
      }
      if (handlingBreaks.length) current.handling_price_breaks = handlingBreaks
    }
    methods.set(id, current)
  }

  const authoritativeOptions = new Set(payloads.flatMap((payload) => objects(payload)).flatMap((candidate) => {
    const component = directValue(candidate, ["component"])
    const location = directValue(candidate, ["location"])
    const code = directValue(candidate, ["table_code", "tablecode"])
    return component && location && code ? [`${slug(`${component}-${location}`)}:${code.split("-")[0].toLowerCase()}`] : []
  }))
  const handled = new WeakSet<object>()
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue
    const product = payload as AnyObject
    for (let index = 1; index <= 64; index += 1) {
      const component = directValue(product, [`component${index}`])
      const location = directValue(product, [`location${index}`])
      if (!component || !location) continue
      const positionName = directValue(product, [`composed_location${index}`]) || `${component} - ${location}`
      const positionId = slug(`${component}-${location}`)
      const area = printingArea(key(product, [`area${index}`]))
      const image = directValue(product, [`area${index}image`, `location${index}image`])
      const variantColor = directValue(product, ["color_desc_1", "color_description", "color_code"])
      const methodNames = String(key(product, [`customization_types${index}`]) || "").split(",").map((item) => item.trim()).filter(Boolean)
      const methodIds = String(key(product, [`table_codes${index}`]) || "").split(",").map((item) => item.trim()).filter(Boolean)
      const optionCodes = String(key(product, [`table_codes_options${index}`]) || "").split(",").map((item) => item.trim()).filter(Boolean)
      const maxColours = String(key(product, [`max_colors${index}`]) || "1").split(",").map((item) => number(item.trim()) || 1)
      const handlingCosts = String(key(product, [`handling_costs${index}`]) || "0").split(",").map((item) => number(item.trim()) || 0)
      for (let methodIndex = 0; methodIndex < methodNames.length; methodIndex += 1) {
        const methodName = methodNames[methodIndex]
        const methodId = methodIds[methodIndex] || slug(methodName)
        if (authoritativeOptions.has(`${positionId}:${methodId.toLowerCase()}`)) continue
        const prefix = methodId.slice(0, 4)
        const allowedCodes = optionCodes.filter((code) => code.startsWith(prefix))
        const sizeOptions = allowedCodes.flatMap((optionCode) => {
          const table = pricingIndex.byOption.get(optionCode)
          if (!table) return []
          const tableArea = centimetreArea(key(table, ["table_max_area_cm", "tablemaxareacm"]))
          const placeholder = (tableArea.width || 0) >= 990 && (tableArea.height || 0) >= 990
          const width = placeholder ? area.width : Math.min(tableArea.width || area.width || 0, area.width || tableArea.width || 0)
          const height = placeholder ? area.height : Math.min(tableArea.height || area.height || 0, area.height || tableArea.height || 0)
          if (!width || !height) return []
          const priceByColour = boolean(key(table, ["price_by_color", "pricebycolor"]))
          const priceByStitches = boolean(key(table, ["price_by_stitches", "pricebystitches"]))
          return [{
            id: optionCode,
            label: `${(width / 10).toFixed(1)} × ${(height / 10).toFixed(1)} cm`,
            width_mm: width,
            height_mm: height,
            pricing_code: priceByStitches
              ? methodId
              : priceByColour ? directValue(table, ["table_code", "tablecode"]) || optionCode : optionCode,
          }]
        }).filter((item, itemIndex, all) => all.findIndex((other) => other.label === item.label && other.pricing_code === item.pricing_code) === itemIndex)
        const hasExplicitOptions = allowedCodes.length > 0
        if (hasExplicitOptions && !sizeOptions.length) continue
        const effectiveSizes = sizeOptions.length ? sizeOptions : area.width && area.height ? [{
          id: methodId,
          label: `${(area.width / 10).toFixed(1)} × ${(area.height / 10).toFixed(1)} cm`,
          width_mm: area.width,
          height_mm: area.height,
          pricing_code: methodId,
        }] : []
        add(methodName, methodId, {
          id: positionId,
          name: positionName,
          max_width_mm: area.width,
          max_height_mm: area.height,
          max_colours: maxColours[methodIndex] || maxColours[0] || 1,
          handling_price_eur: handlingCosts[methodIndex] || handlingCosts[0] || undefined,
          image_url: image,
          images: image ? [{ variant_color: variantColor, url: image }] : undefined,
          size_options: effectiveSizes,
        }, product)
      }
      handled.add(product)
    }
  }
  for (const candidate of payloads.flatMap((payload) => objects(payload))) {
    if (handled.has(candidate)) continue
    const component = fieldValue(candidate, ["component", "product_component"])
    const location = fieldValue(candidate, ["location", "customization_location"])
    const tableCode = fieldValue(candidate, ["table_code", "tablecode"])
    const strickerMethodName = fieldValue(candidate, ["customization_type_name", "customization_type", "technique"])
    if (component && location && tableCode && strickerMethodName) {
      const locationArea = printingArea(key(candidate, ["location_max_printing_area_mm"]))
      const tableArea = centimetreArea(key(candidate, ["table_max_area_cm"]))
      const placeholder = (tableArea.width || 0) >= 990 && (tableArea.height || 0) >= 990
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
      continue
    }
    const positionName = fieldValue(candidate, ["product_component_locations", "product_composed_locations", "product_component_default_location", "print_position_description", "position_name", "position_description", "position_id", "position", "location_name", "location_description", "location", "print_position_type", "customization_area", "area"])
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

  return [...methods.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function validateDecorationChoice(method: DecorationMethod, position: DecorationPosition, choice: { print_colours?: number; print_stitches?: number; pricing_code?: string; print_width_mm?: number; print_height_mm?: number }) {
  const colours = choice.print_colours || 1
  if (!Number.isInteger(colours) || colours < 1 || (position.max_colours && colours > position.max_colours)) return "Choose a valid number of print colours"
  if (method.colour_mode !== "spot_colour" && colours !== 1) return "This printing technique does not allow a colour-count selection"
  const sizes = position.size_options || []
  const size = sizes.find((item) => (item.pricing_code === choice.pricing_code || item.id === choice.pricing_code) && item.width_mm === choice.print_width_mm && item.height_mm === choice.print_height_mm)
  if (sizes.length && !size) return "Choose a print size supplied for this technique"
  if ((choice.print_width_mm && choice.print_width_mm < 1) || (choice.print_height_mm && choice.print_height_mm < 1) || (position.max_width_mm && choice.print_width_mm && choice.print_width_mm > position.max_width_mm) || (position.max_height_mm && choice.print_height_mm && choice.print_height_mm > position.max_height_mm)) return "Artwork dimensions exceed the selected print area"
  const stitchTables = (method.price_tables || []).filter((table) => table.price_by_stitches && table.max_stitches)
  if (stitchTables.length && (!choice.print_stitches || choice.print_stitches < 1 || choice.print_stitches > Math.max(...stitchTables.map((table) => Number(table.max_stitches))))) return "Choose a supported stitch count"
  return null
}

export function decorationPrice(method: DecorationMethod | undefined, quantity: number, options: { colours?: number; width_mm?: number; height_mm?: number; color_code?: string; pricing_code?: string; handling_price_eur?: number; stitches?: number } = {}) {
  if (!method) return { unit: 0, handling: 0, setup: 0, pending: false }
  const colours = Math.max(1, Math.floor(options.colours || 1))
  const areaCm2 = options.width_mm && options.height_mm ? (options.width_mm * options.height_mm) / 100 : undefined
  let selectedTable: DecorationPriceTable | undefined
  if (method.price_tables?.length) {
    const exactTables = method.price_tables.filter((table) => {
      if (!options.pricing_code) return true
      return table.option_code === options.pricing_code || table.code === options.pricing_code
    })
    let tables = exactTables
    if (!tables.length && options.pricing_code) {
      tables = method.price_tables.filter((table) => table.code.startsWith(`${options.pricing_code}-`))
    }
    if (tables.some((table) => table.price_by_color)) {
      tables = tables.filter((table) => table.price_by_color && table.max_colours === colours)
    }
    if (tables.some((table) => table.price_by_stitches)) {
      const stitches = Math.floor(options.stitches || 0)
      if (stitches < 1) return { unit: 0, handling: 0, setup: 0, pending: true }
      tables = tables
        .filter((table) => table.price_by_stitches && Boolean(table.max_stitches) && stitches <= Number(table.max_stitches))
        .sort((left, right) => Number(left.max_stitches) - Number(right.max_stitches))
    }
    const areaTables = tables.filter((table) => table.price_by_area && areaCm2 !== undefined && (!table.max_area_cm2 || areaCm2 <= table.max_area_cm2))
    selectedTable = exactTables.length
      ? tables[0]
      : (areaTables.length ? areaTables.sort((left, right) => (left.max_area_cm2 || Number.MAX_SAFE_INTEGER) - (right.max_area_cm2 || Number.MAX_SAFE_INTEGER)) : tables.filter((table) => !table.price_by_area))[0]
    if (!selectedTable) return { unit: 0, handling: 0, setup: 0, pending: true }
  }
  const pricingType = selectedTable
    ? selectedTable.price_by_color ? "numberofcolours" : selectedTable.price_by_area ? "arearange" : ""
    : method.pricing_type?.toLowerCase() || ""
  const needsArea = pricingType.includes("area")
  const range = method.price_ranges
    ?.filter((item) => {
      if (areaCm2 === undefined) return false
      const from = item.area_from_cm2 || 0
      const to = item.area_to_cm2 || Number.POSITIVE_INFINITY
      return areaCm2 >= from && areaCm2 <= to
    })
    .sort((left, right) => (right.area_from_cm2 || 0) - (left.area_from_cm2 || 0))[0]
  if (!selectedTable && method.price_ranges?.some((item) => item.area_from_cm2 !== undefined || item.area_to_cm2 !== undefined) && !range) return { unit: 0, handling: 0, setup: 0, pending: true }
  const breaks = selectedTable?.price_breaks?.length ? selectedTable.price_breaks : range?.price_breaks?.length ? range.price_breaks : method.price_breaks
  if (!breaks.length || (needsArea && areaCm2 === undefined)) return { unit: 0, handling: 0, setup: method?.setup_price_eur || 0, pending: true }
  const selected = [...breaks].filter((item) => item.quantity <= quantity).sort((left, right) => right.quantity - left.quantity)[0]
  if (!selected) return { unit: 0, handling: 0, setup: method?.setup_price_eur || 0, pending: true }
  const byColour = pricingType.includes("colour") || pricingType.includes("color")
  const whiteTextileCodes = new Set(["AS", "WW", "WD", "WH", "NB", "NW", "RH"])
  const pricedColours = method.id.toUpperCase() === "ST" && options.color_code && !whiteTextileCodes.has(options.color_code.toUpperCase()) ? colours + 1 : colours
  let unit = selectedTable?.price_by_color
    ? selected.unit_price_eur
    : byColour ? (method.next_colour_cost_indicator && selected.next_colour_price_eur !== undefined ? selected.unit_price_eur + selected.next_colour_price_eur * (pricedColours - 1) : selected.unit_price_eur * pricedColours) : selected.unit_price_eur
  if (pricingType === "area" && areaCm2 !== undefined) unit *= areaCm2
  const handlingBreaks = method.handling_price_breaks || []
  const handling = options.handling_price_eur ?? [...handlingBreaks].filter((item) => item.quantity <= quantity).sort((left, right) => right.quantity - left.quantity)[0]?.unit_price_eur ?? 0
  return {
    unit,
    handling,
    setup: (method.setup_price_eur || 0) * (byColour && !selectedTable?.price_by_color ? colours : 1),
    pending: false,
  }
}
