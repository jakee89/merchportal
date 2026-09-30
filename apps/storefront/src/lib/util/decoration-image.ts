type Guide = { variant_color?: string; variant_sku?: string; url: string }
type Position = { image_url?: string; images?: Guide[] }
type Variant = { sku?: string; color?: string; color_code?: string }

const normalized = (value?: string) => value?.trim().toLowerCase() || ""

export function decorationImage(position: Position | undefined, variant: Variant | undefined) {
  const images = position?.images || []
  const sku = normalized(variant?.sku)
  const colours = [variant?.color, variant?.color_code, variant?.sku?.split("-").at(-1)].map(normalized).filter(Boolean)
  const exact = images.find((image) => sku && normalized(image.variant_sku) === sku)
    || images.find((image) => !image.variant_sku && image.variant_color && colours.includes(normalized(image.variant_color)))
  if (exact) return { url: exact.url, generic: false }
  const generic = images.find((image) => !image.variant_color && !image.variant_sku)
  return { url: generic?.url || (!images.length ? position?.image_url : undefined), generic: true }
}
