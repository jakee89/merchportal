import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow, createProductCategoriesWorkflow, createProductVariantsWorkflow, createProductsWorkflow, updateInventoryLevelsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { normalizeSupplierCatalog, normalizedProductHandle, type NormalizedProduct } from "../modules/merchportal/normalization"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { sellingPrice } from "../modules/merchportal/catalog-rules"
import { resolveMarkup } from "./manage-pricing-rules"

type Input = { source_keys: string[] }

function batches<T>(items: T[], size = 250) {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size))
  }
  return output
}

async function persistProductSources(container: any, normalized: NormalizedProduct[], nativeProducts: any[]) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = await service.listSuppliers({})
  const supplierByCode = new Map<string, any>(suppliers.map((supplier: any) => [supplier.code, supplier]))
  const nativeByKey = new Map<string, any>(nativeProducts.map((product: any) => [product.external_id, product]))
  const existingSources = await service.listPublishedProductSources({}, { take: 50000 })
  const existingByKey = new Map<string, any>(existingSources.map((source: any) => [source.source_key, source]))
  const creates: any[] = []
  const updates: any[] = []
  for (const product of normalized) {
    const native = nativeByKey.get(product.source_key)
    const supplier = supplierByCode.get(product.supplier_code)
    if (!native || !supplier) continue
    const stockQuantities = product.variants.map((variant) => variant.stock_quantity).filter((value): value is number => value !== undefined)
    const data = {
      source_key: product.source_key,
      product_id: native.id,
      supplier_id: supplier.id,
      cost_by_sku: Object.fromEntries(product.variants.flatMap((variant) => (variant.price_eur === undefined ? [] : [[variant.sku, variant.price_eur]]))),
      lead_time: product.lead_time || null,
      sustainable: product.sustainable,
      print_methods: product.print_methods,
      decoration_options: product.decoration_options,
      attributes: product.attributes,
      catalog_document: {
        id: native.id,
        name: product.title,
        description: product.description,
        image_url: product.images[0] || null,
        images: product.images,
        category: product.category,
        colors: [...new Set(product.variants.map((variant) => variant.color_group || variant.color))],
        materials: product.attributes.materials,
        brand: product.attributes.brand,
        country_of_origin: product.attributes.country_of_origin,
        dimensions: product.attributes.dimensions,
        weight: product.attributes.weight,
        keywords: product.attributes.keywords,
        stock_quantity: stockQuantities.length ? stockQuantities.reduce((total, value) => total + value, 0) : undefined,
        lead_time: product.lead_time,
        sustainable: product.sustainable,
        print_methods: product.print_methods,
        variants: product.variants.map((variant) => {
          const nativeVariant = native.variants?.find((item: any) => item.sku === variant.sku)
          return {
            id: nativeVariant?.id,
            title: variant.title,
            sku: variant.sku,
            color: variant.color,
            color_code: variant.color_code,
            color_group: variant.color_group,
            size: variant.size,
            stock_quantity: variant.stock_quantity,
          }
        }),
      },
    }
    const existing = existingByKey.get(product.source_key)
    if (existing) {
      updates.push({ id: existing.id, ...data })
    } else {
      creates.push(data)
    }
  }
  for (const batch of batches(creates)) {
    await service.createPublishedProductSources(batch)
  }
  for (const batch of batches(updates)) {
    await service.updatePublishedProductSources(batch)
  }
}

export async function refreshPublishedSupplierProducts(container: any, supplierCode?: "stricker" | "midocean", normalizedProducts?: NormalizedProduct[], onProgress?: (percent: number, message: string) => Promise<void>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const markup = await resolveMarkup(service)
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
  const published = products.filter((product: any) => product.external_id?.startsWith("mp_"))
  if (!published.length || !locations.length) {
    return { updated_products: 0, updated_prices: 0, updated_stock: 0 }
  }

  const normalized =
    normalizedProducts ||
    (await normalizeSupplierCatalog(container, {
      source_keys: published.map((product: any) => product.external_id),
      take: published.length,
    }))
  const selected = supplierCode ? normalized.filter((product) => product.supplier_code === supplierCode) : normalized
  if (supplierCode && selected.length) {
    const suppliers = await service.listSuppliers({ code: supplierCode }, { take: 1 })
    const currentSources = suppliers.length ? await service.listPublishedProductSources({ supplier_id: suppliers[0].id }, { take: 50000 }) : []
    const currentKeys = new Set(selected.map((product) => product.source_key))
    const staleIds = currentSources.filter((source: any) => !currentKeys.has(source.source_key)).map((source: any) => source.id)
    if (staleIds.length) await service.deletePublishedProductSources(staleIds)
  }
  const normalizedByKey = new Map(selected.map((product) => [product.source_key, product]))
  const variantBySku = new Map<string, any>()
  const nativeProductByKey = new Map<string, any>(published.map((product: any) => [product.external_id, product]))
  for (const product of published) {
    if (!normalizedByKey.has(product.external_id)) continue
    for (const variant of product.variants || []) {
      if (variant.sku) variantBySku.set(variant.sku, variant)
    }
  }

  const missingVariants = selected.flatMap((product) => {
    const nativeProduct = nativeProductByKey.get(product.source_key)
    if (!nativeProduct) return []
    return product.variants
      .filter((variant) => !variantBySku.has(variant.sku))
      .map((variant) => ({
        product_id: nativeProduct.id,
        title: variant.title,
        sku: variant.sku,
        manage_inventory: true,
        options: { Color: variant.color, Size: variant.size },
        prices:
          variant.price_eur === undefined
            ? []
            : [
                {
                  currency_code: "eur",
                  amount: sellingPrice(variant.price_eur, markup),
                },
              ],
      }))
  })
  if (missingVariants.length) {
    for (const batch of batches(missingVariants, 100)) {
      await createProductVariantsWorkflow(container).run({
        input: { product_variants: batch } as any,
      })
    }
    const { data: refreshedProducts } = await query.graph({
      entity: "product",
      fields: ["id", "external_id", "variants.id", "variants.sku"],
      filters: { id: published.map((product: any) => product.id) },
      pagination: { take: 50000 },
    })
    for (const product of refreshedProducts) {
      nativeProductByKey.set(product.external_id, product)
      for (const variant of product.variants || []) {
        if (variant.sku) variantBySku.set(variant.sku, variant)
      }
    }
    await onProgress?.(94, `Added ${missingVariants.length.toLocaleString()} new product options`)
  }

  const variantUpdates = selected.flatMap((product) =>
    product.variants.flatMap((variant) => {
      const existing = variantBySku.get(variant.sku)
      if (!existing || variant.price_eur === undefined) return []
      return [
        {
          id: existing.id,
          prices: [
            {
              currency_code: "eur",
              amount: sellingPrice(variant.price_eur, markup),
            },
          ],
        },
      ]
    }),
  )
  if (variantUpdates.length) {
    for (const batch of batches(variantUpdates)) {
      await updateProductVariantsWorkflow(container).run({
        input: { product_variants: batch },
      })
    }
    await onProgress?.(96, `Updated ${variantUpdates.length.toLocaleString()} client prices`)
  }

  const stockBySku = new Map(selected.flatMap((product) => product.variants.flatMap((variant) => (variant.stock_quantity === undefined ? [] : [[variant.sku, variant.stock_quantity] as const]))))
  const skus = [...stockBySku.keys()].filter((sku) => variantBySku.has(sku))
  if (!skus.length) {
    await persistProductSources(container, selected, [...nativeProductByKey.values()])
    await onProgress?.(99, "Updated catalog search and filters")
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
    const level = item.location_levels?.find((candidate: any) => candidate.location_id === locations[0].id)
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
    for (const batch of batches(updates, 500)) {
      await updateInventoryLevelsWorkflow(container).run({
        input: { updates: batch },
      })
    }
  }
  if (creates.length) {
    for (const batch of batches(creates, 500)) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: batch as any },
      })
    }
  }
  await onProgress?.(98, `Updated ${(updates.length + creates.length).toLocaleString()} stock quantities`)
  await persistProductSources(container, selected, [...nativeProductByKey.values()])
  await onProgress?.(99, "Updated catalog search and filters")
  return {
    updated_products: selected.length,
    updated_prices: variantUpdates.length,
    updated_stock: updates.length + creates.length,
  }
}

export async function publishNormalizedProductBatch(container: any, pending: NormalizedProduct[]) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const markup = await resolveMarkup(service)
  if (!pending.length) return { created: 0, products: [] }
  const [{ data: salesChannels }, { data: profiles }, { data: locations }] = await Promise.all([
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
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Run Configure Malta & EUR before publishing products")
  }

  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const categoryByName = new Map<string, any>(existingCategories.map((category: any) => [category.name, category]))
  const missingCategoryNames = [...new Set(pending.map((product) => product.category).filter((name): name is string => Boolean(name)))].filter((name) => !categoryByName.has(name))
  if (missingCategoryNames.length) {
    const { result: createdCategories } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missingCategoryNames.map((name) => ({
          name,
          is_active: true,
        })),
      },
    })
    createdCategories.forEach((category: any) => categoryByName.set(category.name, category))
  }

  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: pending.map((product) => ({
        title: product.title,
        subtitle: product.category,
        description: product.description,
        handle: normalizedProductHandle(product),
        external_id: product.source_key,
        category_ids: product.category ? [categoryByName.get(product.category)?.id].filter(Boolean) : [],
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
              ? [
                  {
                    currency_code: "eur",
                    amount: sellingPrice(variant.price_eur, markup),
                  },
                ]
              : [],
        })),
      })) as any,
    },
  })

  const stockBySku = new Map(pending.flatMap((product) => product.variants.map((variant) => [variant.sku, variant.stock_quantity] as const)))
  const skus = [...stockBySku.keys()]
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "location_levels.location_id"],
    filters: { sku: skus },
  })
  const levels = inventoryItems
    .filter((item: any) => !item.location_levels?.some((level: any) => level.location_id === locations[0].id))
    .map((item: any) => ({
      inventory_item_id: item.id,
      location_id: locations[0].id,
      stocked_quantity: Math.max(0, Math.floor(stockBySku.get(item.sku) || 0)),
    }))
  if (levels.length) {
    for (const batch of batches(levels, 500)) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: batch as any },
      })
    }
  }
  await persistProductSources(container, pending, products)

  return {
    created: products.length,
    products: products.map((product: any) => ({
      id: product.id,
      title: product.title,
    })),
  }
}

export async function autoPublishSupplierCatalog(container: any, supplierCode: "stricker" | "midocean", onProgress?: (published: number, total: number) => Promise<void>) {
  const normalized = await normalizeSupplierCatalog(container, { take: 50000 })
  const pending = normalized.filter((product) => product.supplier_code === supplierCode && !product.published)
  let created = 0
  for (let index = 0; index < pending.length; index += 100) {
    const result = await publishNormalizedProductBatch(container, pending.slice(index, index + 100))
    created += result.created
    await onProgress?.(Math.min(index + 100, pending.length), pending.length)
  }
  return {
    created,
    total: normalized.filter((product) => product.supplier_code === supplierCode).length,
    normalized,
  }
}

const publishNormalizedProductsStep = createStep("publish-normalized-products", async (input: Input, { container }) => {
  const normalized = await normalizeSupplierCatalog(container, {
    source_keys: input.source_keys.slice(0, 100),
    take: 100,
  })
  return new StepResponse(
    await publishNormalizedProductBatch(
      container,
      normalized.filter((product) => !product.published),
    ),
  )
})

export const publishNormalizedProductsWorkflow = createWorkflow("publish-normalized-products", (input: Input) => new WorkflowResponse(publishNormalizedProductsStep(input)))
