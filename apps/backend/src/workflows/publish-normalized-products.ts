import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  updateInventoryLevelsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  normalizeSupplierCatalog,
  normalizedProductHandle,
} from "../modules/merchportal/normalization"

type Input = { source_keys: string[] }

export async function refreshPublishedSupplierProducts(
  container: any,
  supplierCode?: "stricker" | "midocean"
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: products }, { data: locations }] = await Promise.all([
    query.graph({
      entity: "product",
      fields: ["id", "external_id", "variants.id", "variants.sku"],
      filters: { status: ProductStatus.PUBLISHED },
      pagination: { take: 50000 },
    }),
    query.graph({
      entity: "stock_location",
      fields: ["id"],
      filters: { name: "Malta Operations" },
    }),
  ])
  const published = products.filter((product: any) =>
    product.external_id?.startsWith("mp_")
  )
  if (!published.length || !locations.length) {
    return { updated_products: 0, updated_prices: 0, updated_stock: 0 }
  }

  const normalized = await normalizeSupplierCatalog(container, {
    source_keys: published.map((product: any) => product.external_id),
    take: published.length,
  })
  const selected = supplierCode
    ? normalized.filter((product) => product.supplier_code === supplierCode)
    : normalized
  const normalizedByKey = new Map(
    selected.map((product) => [product.source_key, product])
  )
  const variantBySku = new Map<string, any>()
  for (const product of published) {
    if (!normalizedByKey.has(product.external_id)) continue
    for (const variant of product.variants || []) {
      if (variant.sku) variantBySku.set(variant.sku, variant)
    }
  }

  const variantUpdates = selected.flatMap((product) =>
    product.variants.flatMap((variant) => {
      const existing = variantBySku.get(variant.sku)
      if (!existing || variant.price_eur === undefined) return []
      return [{
        id: existing.id,
        prices: [{ currency_code: "eur", amount: variant.price_eur }],
      }]
    })
  )
  if (variantUpdates.length) {
    await updateProductVariantsWorkflow(container).run({
      input: { product_variants: variantUpdates },
    })
  }

  const stockBySku = new Map(
    selected.flatMap((product) =>
      product.variants.flatMap((variant) =>
        variant.stock_quantity === undefined
          ? []
          : [[variant.sku, variant.stock_quantity] as const]
      )
    )
  )
  const skus = [...stockBySku.keys()].filter((sku) => variantBySku.has(sku))
  if (!skus.length) {
    return {
      updated_products: selected.length,
      updated_prices: variantUpdates.length,
      updated_stock: 0,
    }
  }
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "location_levels.id", "location_levels.location_id"],
    filters: { sku: skus },
  })
  const creates: any[] = []
  const updates: any[] = []
  for (const item of inventoryItems) {
    const quantity = Math.max(0, Math.floor(stockBySku.get(item.sku) || 0))
    const level = item.location_levels?.find(
      (candidate: any) => candidate.location_id === locations[0].id
    )
    if (level) {
      updates.push({
        id: level.id,
        inventory_item_id: item.id,
        location_id: locations[0].id,
        stocked_quantity: quantity,
      })
    } else {
      creates.push({
        inventory_item_id: item.id,
        location_id: locations[0].id,
        stocked_quantity: quantity,
      })
    }
  }
  if (updates.length) {
    await updateInventoryLevelsWorkflow(container).run({ input: { updates } })
  }
  if (creates.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: creates },
    })
  }
  return {
    updated_products: selected.length,
    updated_prices: variantUpdates.length,
    updated_stock: updates.length + creates.length,
  }
}

const publishNormalizedProductsStep = createStep(
  "publish-normalized-products",
  async (input: Input, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const normalized = await normalizeSupplierCatalog(container, {
      source_keys: input.source_keys.slice(0, 20),
      take: 20,
    })
    const pending = normalized.filter((product) => !product.published)
    if (!pending.length) return new StepResponse({ created: 0, products: [] })

    const [{ data: salesChannels }, { data: profiles }, { data: locations }] =
      await Promise.all([
        query.graph({
          entity: "sales_channel",
          fields: ["id"],
          filters: { name: "MerchPortal Malta" },
        }),
        query.graph({ entity: "shipping_profile", fields: ["id"] }),
        query.graph({
          entity: "stock_location",
          fields: ["id"],
          filters: { name: "Malta Operations" },
        }),
      ])
    if (!salesChannels.length || !profiles.length || !locations.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Run Configure Malta & EUR before publishing products"
      )
    }

    const { data: existingCategories } = await query.graph({
      entity: "product_category",
      fields: ["id", "name"],
    })
    const categoryByName = new Map<string, any>(
      existingCategories.map((category: any) => [category.name, category])
    )
    const missingCategoryNames = [
      ...new Set(
        pending
          .map((product) => product.category)
          .filter((name): name is string => Boolean(name))
      ),
    ].filter((name) => !categoryByName.has(name))
    if (missingCategoryNames.length) {
      const { result: createdCategories } =
        await createProductCategoriesWorkflow(container).run({
          input: {
            product_categories: missingCategoryNames.map((name) => ({
              name,
              is_active: true,
            })),
          },
        })
      createdCategories.forEach((category: any) =>
        categoryByName.set(category.name, category)
      )
    }

    const { result: products } = await createProductsWorkflow(container).run({
      input: {
        products: pending.map((product) => ({
          title: product.title,
          subtitle: product.category,
          description: product.description,
          handle: normalizedProductHandle(product),
          external_id: product.source_key,
          category_ids: product.category
            ? [categoryByName.get(product.category)?.id].filter(Boolean)
            : [],
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: profiles[0].id,
          sales_channels: [{ id: salesChannels[0].id }],
          thumbnail: product.images[0],
          images: product.images.map((url) => ({ url })),
          options: [
            {
              title: "Color",
              values: [...new Set(product.variants.map((variant) => variant.color))],
            },
            {
              title: "Size",
              values: [...new Set(product.variants.map((variant) => variant.size))],
            },
          ],
          variants: product.variants.map((variant) => ({
            title: variant.title,
            sku: variant.sku,
            manage_inventory: true,
            options: { Color: variant.color, Size: variant.size },
            prices:
              variant.price_eur !== undefined
                ? [{ currency_code: "eur", amount: variant.price_eur }]
                : [],
          })),
        })) as any,
      },
    })

    const stockBySku = new Map(
      pending.flatMap((product) =>
        product.variants.map((variant) => [variant.sku, variant.stock_quantity] as const)
      )
    )
    const skus = [...stockBySku.keys()]
    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku", "location_levels.location_id"],
      filters: { sku: skus },
    })
    const levels = inventoryItems
      .filter((item: any) =>
        !item.location_levels?.some(
          (level: any) => level.location_id === locations[0].id
        )
      )
      .map((item: any) => ({
        inventory_item_id: item.id,
        location_id: locations[0].id,
        stocked_quantity: Math.max(0, Math.floor(stockBySku.get(item.sku) || 0)),
      }))
    if (levels.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: levels },
      })
    }

    return new StepResponse({
      created: products.length,
      products: products.map((product: any) => ({ id: product.id, title: product.title })),
    })
  }
)

export const publishNormalizedProductsWorkflow = createWorkflow(
  "publish-normalized-products",
  (input: Input) => new WorkflowResponse(publishNormalizedProductsStep(input))
)
