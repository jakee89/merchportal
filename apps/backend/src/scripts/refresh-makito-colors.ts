import type { ExecArgs } from "@medusajs/framework/types"
import { refreshCatalogPreviewSizes, refreshMakitoColorLabels } from "../workflows/publish-normalized-products"

export default async function refreshMakitoColors({ container }: ExecArgs) {
  const result = await refreshMakitoColorLabels(container)
  const otherSizes = await refreshCatalogPreviewSizes(container)
  console.log(`Makito colour labels refreshed: ${result.updated} of ${result.total} published products`)
  console.log(`Catalog size previews refreshed: ${otherSizes} published products`)
}
