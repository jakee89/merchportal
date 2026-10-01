import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { customerQuoteContext } from "../quotes/auth"
import {
  catalogCardData,
  changeShortlist,
  clientShortlists,
  discoveryCatalog,
  discoverySuggestions,
  featuredCollections,
} from "../../../modules/merchportal/client-discovery"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { service, membership, actorId } = await customerQuoteContext(req)
  const { products, revision } = await discoveryCatalog(
    req.scope,
    service,
    membership.organization_id,
  )
  res.setHeader("Cache-Control", "private, no-store")
  if (req.query.kind === "suggestions")
    return res.json(
      await discoverySuggestions(
        req.scope,
        service,
        products,
        revision,
        req.query.q,
      ),
    )
  if (req.query.kind === "featured") {
    const byId = new Map(products.map((product: any) => [product.id, product]))
    const collections = (await featuredCollections(service))
      .filter((collection: any) => collection.enabled)
      .map((collection: any) => ({
        label: collection.label,
        products: collection.product_ids
          .filter((id: string) => byId.has(id))
          .map((id: string) => catalogCardData(byId.get(id))),
      }))
      .filter((collection: any) => collection.products.length)
    return res.json({ collections })
  }
  if (req.query.kind !== "shortlists")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Unknown discovery view",
    )
  res.json({
    shortlists: await clientShortlists(
      service,
      actorId,
      membership.organization_id,
      products,
    ),
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<Record<string, unknown>>,
  res: MedusaResponse,
) {
  // Viewers may maintain private favourites, but the existing cart workflow
  // still denies quote/cart mutations for viewers.
  const { service, membership, actorId } = await customerQuoteContext(req)
  const { products } = await discoveryCatalog(
    req.scope,
    service,
    membership.organization_id,
  )
  const result = await changeShortlist(
    service,
    actorId,
    membership.organization_id,
    req.body,
    products,
  )
  res.setHeader("Cache-Control", "no-store")
  res.json({
    result_id: result?.id,
    shortlists: await clientShortlists(
      service,
      actorId,
      membership.organization_id,
      products,
    ),
  })
}
