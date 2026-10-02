import { strickerPositionImages, type DecorationMethod } from "./decoration"
import { supplierImageToken } from "./media"
import { supplierAssetUrl } from "./normalization"

export async function productDecorationImages(service: any, source: any, supplierCode?: string): Promise<DecorationMethod[]> {
  const methods: DecorationMethod[] = Array.isArray(source.decoration_options) ? source.decoration_options : []
  const skus = [...new Set<string>((source.catalog_document?.variants || []).map((variant: any) => variant.sku).filter((sku: unknown) => typeof sku === "string" && sku))]
  if (supplierCode !== "stricker" || !skus.length) return methods
  const records = await service.listRawSupplierRecords({ supplier_id: source.supplier_id, record_type: "product", external_id: skus }, { take: skus.length, select: ["payload"] })
  const guides = strickerPositionImages(records.map((record: any) => record.payload))
  return methods.map((method) => ({ ...method, positions: (method.positions || []).map((position) => {
    const rawGuides = guides.get(position.id)
    if (!rawGuides) return position
    const images = rawGuides.flatMap((image) => {
      const token = supplierImageToken(supplierAssetUrl(image.url, "stricker"))
      return token ? [{ ...image, url: `/media/${token}` }] : []
    })
    // Replace legacy location photos, including their exact-SKU bindings which
    // would otherwise outrank a generic dotted guide in the storefront.
    return { ...position, image_url: images[0]?.url, images }
  }) }))
}
