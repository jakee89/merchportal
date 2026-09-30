type Size = { id: string; width_mm: number; height_mm: number; pricing_code?: string; variant_sku?: string }
type Selection = { sizeId: string; pricingCode: string }
type Position = { max_width_mm?: number; max_height_mm?: number }

export function selectedPrintSize<T extends Size>(sizes: T[], selection: Selection) {
  return sizes.find((size) => size.id === selection.sizeId)
    || sizes.find((size) => (size.pricing_code || size.id) === selection.pricingCode)
}

export function uniquePrintSizes<T extends Size>(sizes: T[], selection: Selection) {
  const selected = selectedPrintSize(sizes, selection)
  return sizes.filter((size, index) => {
    const sameDimensions = (other: T) => other.width_mm === size.width_mm && other.height_mm === size.height_mm
    return selected && sameDimensions(selected) ? size === selected : sizes.findIndex(sameDimensions) === index
  })
}

export function printDimensionLimits(position?: Position, size?: Size) {
  const smallest = (...values: Array<number | undefined>) => {
    const known = values.filter((value): value is number => Number.isFinite(value) && Number(value) > 0)
    return known.length ? Math.min(...known) : undefined
  }
  return { width: smallest(position?.max_width_mm, size?.width_mm), height: smallest(position?.max_height_mm, size?.height_mm) }
}

export function boundedPrintDimension(value: string, maximum?: number) {
  if (!value.trim()) return ""
  const number = Number(value)
  return Number.isFinite(number) ? String(Math.max(0.1, Math.min(number, maximum || Infinity))) : ""
}

export function validPrintDimensions(width: string, height: string, limits: ReturnType<typeof printDimensionLimits>) {
  return Number.isFinite(Number(width)) && Number.isFinite(Number(height)) && Number(width) > 0 && Number(height) > 0
    && (!limits.width || Number(width) <= limits.width) && (!limits.height || Number(height) <= limits.height)
}
