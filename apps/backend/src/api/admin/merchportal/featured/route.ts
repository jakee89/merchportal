import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import {
  catalogCardData,
  discoveryCatalog,
  featuredCollections,
  saveFeaturedCollections,
} from "../../../../modules/merchportal/client-discovery"
import { searchCatalog } from "../../../../modules/merchportal/catalog-search"
import { requireStaff } from "../auth"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const staff = await requireStaff(req)
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const { products, revision } = await discoveryCatalog(req.scope, service, "")
  const collections = await featuredCollections(service)
  const q =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : ""
  const matches =
    q.length >= 2
      ? await searchCatalog(req.scope, products, q, revision)
      : new Map()
  const selected = new Set(
    collections.flatMap((collection: any) => collection.product_ids),
  )
  const summarize = (product: any) => {
    const { id, name, sku, image_url } = catalogCardData(product)
    return { id, name, sku, image_url }
  }
  res.setHeader("Cache-Control", "no-store")
  res.json({
    collections,
    can_edit: staff.role === "super_admin",
    products: products
      .filter((product: any) => matches.has(product.id))
      .slice(0, 20)
      .map(summarize),
    selected_products: products
      .filter((product: any) => selected.has(product.id))
      .map(summarize),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<{ collections: unknown }>,
  res: MedusaResponse,
) {
  const staff = await requireStaff(req)
  if (staff.role !== "super_admin")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only administrators can change featured collections",
    )
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const { products } = await discoveryCatalog(req.scope, service, "")
  res.json({
    collections: await saveFeaturedCollections(
      service,
      req.body.collections,
      products,
      req.auth_context.actor_id,
    ),
  })
}
