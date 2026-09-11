import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../../../modules/merchportal"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MERCHPORTAL_MODULE) as any
  const membership = await service.listMemberships(
    {
      actor_id: req.auth_context?.actor_id,
      actor_type: "customer",
      status: "active",
    },
    { take: 1 }
  )
  if (!membership.length) {
    return res
      .status(403)
      .json({ message: "Join a company before viewing the catalog" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "thumbnail",
      "external_id",
      "images.url",
      "sales_channels.name",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.inventory_quantity",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters: { status: ProductStatus.PUBLISHED },
    pagination: { take: 200 },
  })
  const products = data
    .filter(
      (product: any) =>
        product.external_id?.startsWith("mp_") &&
        product.sales_channels?.some(
          (channel: any) => channel.name === "MerchPortal Malta"
        )
    )
    .slice(0, 48)
    .map((product: any) => {
      const eurPrices = product.variants
        ?.flatMap((variant: any) => variant.prices || [])
        .filter((price: any) => price.currency_code === "eur")
        .map((price: any) => Number(price.amount))
        .filter(Number.isFinite) || []
      const stock = product.variants
        ?.map((variant: any) => Number(variant.inventory_quantity))
        .filter(Number.isFinite) || []
      return {
        id: product.id,
        name: product.title,
        description: product.description,
        sku: product.variants?.[0]?.sku,
        image_url: product.thumbnail || product.images?.[0]?.url || null,
        price_eur: eurPrices.length ? Math.min(...eurPrices) : undefined,
        stock_quantity: stock.length
          ? stock.reduce((total: number, value: number) => total + value, 0)
          : undefined,
        variants: product.variants?.map((variant: any) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          stock_quantity: variant.inventory_quantity,
        })),
      }
    })
  res.json({ products })
}
