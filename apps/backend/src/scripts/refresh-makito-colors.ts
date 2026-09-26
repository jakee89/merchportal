import type { ExecArgs } from "@medusajs/framework/types"
import { refreshMakitoColorLabels } from "../workflows/publish-normalized-products"

export default async function refreshMakitoColors({ container }: ExecArgs) {
  const result = await refreshMakitoColorLabels(container)
  console.log(`Makito colour labels refreshed: ${result.updated} of ${result.total} published products`)
}
