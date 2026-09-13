import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules, ProductStatus } from "@medusajs/framework/utils"
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

function publishErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "Unknown publishing error")
  const candidate = error as Record<string, unknown>
  const details: Record<string, unknown> = {}
  for (const key of ["name", "message", "type", "code", "status", "statusCode", "detail", "hint", "constraint", "column", "table", "cause", "errors"]) {
    if (candidate[key] !== undefined) details[key] = candidate[key]
  }
  try {
    const serialized = JSON.stringify(Object.keys(details).length ? details : candidate, Object.getOwnPropertyNames(error))
    if (serialized && serialized !== "{}") return serialized.slice(0, 4_000)
  } catch {}
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function listAllPublishedProductSources(service: any, filters: Record<string, unknown>) {
  const sources: any[] = []
  const take = 5000
  for (let skip = 0; ; skip += take) {
    const batch = await service.listPublishedProductSources(filters, { take, skip })
    sources.push(...batch)
    if (batch.length < take) return sources
  }
}

async function persistProductSources(container: any, normalized: NormalizedProduct[], nativeProducts: any[]) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const suppliers = await service.listSuppliers({})
  const supplierByCode = new Map<string, any>(suppliers.map((supplier: any) => [supplier.code, supplier]))
  const nativeByKey = new Map<string, any>(nativeProducts.map((product: any) => [product.external_id, product]))
  const existingSources = await listAllPublishedProductSources(service, {})
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
        short_description: product.short_description,
        image_url: product.images[0] || null,
        images: product.images,
        category: product.category,
        category_hierarchy: product.category_hierarchy,
        colors: [...new Set(product.variants.map((variant) => variant.color_group || variant.color))],
        materials: product.attributes.materials,
        brand: product.attributes.brand,
        country_of_origin: product.attributes.country_of_origin,
        dimensions: product.attributes.dimensions,
        weight: product.attributes.weight,
        keywords: product.attributes.keywords,
        specifications: product.attributes.specifications,
        downloads: product.downloads,
        supplier_product_code: product.variants[0]?.sku?.replace(/-\d{3}$/u, ""),
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
            ean: variant.ean,
            pantone: variant.pantone,
            dimensions: variant.dimensions,
            images: variant.images,
            stock_quantity: variant.stock_quantity,
            future_stock: variant.future_stock,
            price_breaks: variant.price_breaks,
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
  let selectedSourceKeys = normalizedProducts?.map((product) => product.source_key)
  if (!selectedSourceKeys && supplierCode) {
    const suppliers = await service.listSuppliers({ code: supplierCode }, { take: 1 })
    const sources = suppliers.length ? await listAllPublishedProductSources(service, { supplier_id: suppliers[0].id }) : []
    selectedSourceKeys = sources.map((source) => source.source_key)
  }
  await onProgress?.(92, "Loading the published supplier catalog")
  const [{ data: products }, { data: locations }] = await Promise.all([
    query.graph({
      entity: "product",
      fields: ["id", "external_id", "variants.id", "variants.sku"],
      filters: selectedSourceKeys
        ? { status: ProductStatus.PUBLISHED, external_id: selectedSourceKeys }
        : { status: ProductStatus.PUBLISHED },
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
      supplier_code: supplierCode,
      take: published.length,
    }))
  const selected = supplierCode ? normalized.filter((product) => product.supplier_code === supplierCode) : normalized
  await onProgress?.(93, `Normalized ${selected.length.toLocaleString()} published products`)
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
    const groups = batches(missingVariants, 100)
    for (let index = 0; index < groups.length; index += 1) {
      const batch = groups[index]
      await createProductVariantsWorkflow(container).run({
        input: { product_variants: batch } as any,
      })
      await onProgress?.(94, `Adding product options (${Math.min((index + 1) * 100, missingVariants.length).toLocaleString()} of ${missingVariants.length.toLocaleString()})`)
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
    const groups = batches(variantUpdates)
    for (let index = 0; index < groups.length; index += 1) {
      const batch = groups[index]
      await updateProductVariantsWorkflow(container).run({
        input: { product_variants: batch },
      })
      await onProgress?.(95, `Updating prices (${Math.min((index + 1) * 250, variantUpdates.length).toLocaleString()} of ${variantUpdates.length.toLocaleString()})`)
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
    const groups = batches(updates, 500)
    for (let index = 0; index < groups.length; index += 1) {
      const batch = groups[index]
      await updateInventoryLevelsWorkflow(container).run({
        input: { updates: batch },
      })
      await onProgress?.(97, `Updating stock (${Math.min((index + 1) * 500, updates.length).toLocaleString()} of ${updates.length.toLocaleString()})`)
    }
  }
  if (creates.length) {
    const groups = batches(creates, 500)
    for (let index = 0; index < groups.length; index += 1) {
      const batch = groups[index]
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: batch as any },
      })
      await onProgress?.(97, `Creating stock records (${Math.min((index + 1) * 500, creates.length).toLocaleString()} of ${creates.length.toLocaleString()})`)
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
  const inventoryService = container.resolve(Modules.INVENTORY) as any
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

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "title", "external_id", "variants.id", "variants.sku"],
    filters: { external_id: pending.map((product) => product.source_key) },
  })
  const existingKeys = new Set(existingProducts.map((product: any) => product.external_id))
  const productsToCreate = pending.filter((product) => !existingKeys.has(product.source_key))
  const incomingSkus = [...new Set(productsToCreate.flatMap((product) => product.variants.map((variant) => variant.sku)))]
  for (const skuBatch of batches(incomingSkus, 500)) {
    const { data: existingInventory } = await query.graph({
      entity: "inventory_item",
      fields: ["id", "variants.id"],
      filters: { sku: skuBatch },
      pagination: { take: 5000 },
    })
    const staleInventoryIds = existingInventory
      .filter((item: any) => !item.variants?.length)
      .map((item: any) => item.id)
    if (staleInventoryIds.length) await inventoryService.deleteInventoryItems(staleInventoryIds)
  }
  let createdProducts: any[] = []
  if (productsToCreate.length) {
    const created = await createProductsWorkflow(container).run({
      input: {
        products: productsToCreate.map((product) => ({
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
    createdProducts = created.result
  }
  const products = [...existingProducts, ...createdProducts]

  // Make products client-visible before optional inventory work. A stock failure
  // must never leave valid native products disconnected from the client catalog.
  await persistProductSources(container, pending, products)

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
  return {
    created: createdProducts.length,
    products: products.map((product: any) => ({
      id: product.id,
      title: product.title,
    })),
  }
}

export async function autoPublishSupplierCatalog(container: any, supplierCode: "stricker" | "midocean", onProgress?: (published: number, total: number) => Promise<void>, onIssue?: (message: string) => Promise<void>) {
  const normalized = await normalizeSupplierCatalog(container, { supplier_code: supplierCode, take: Number.MAX_SAFE_INTEGER })
  const pending = normalized.filter((product) => !product.published && product.variants.length)
  let created = 0
  let consecutiveErrors = 0
  const errors: string[] = []
  await onProgress?.(0, pending.length)
  for (let index = 0; index < pending.length; index += 20) {
    const group = pending.slice(index, index + 20)
    try {
      const result = await publishNormalizedProductBatch(container, group)
      created += result.created
      consecutiveErrors = 0
    } catch (groupError) {
      for (const product of group) {
        try {
          const result = await publishNormalizedProductBatch(container, [product])
          created += result.created
          consecutiveErrors = 0
        } catch (error) {
          const variantSummary = product.variants
            .slice(0, 5)
            .map((variant) => `${variant.sku} [${variant.color} / ${variant.size}]`)
            .join(", ")
          const message = [
            `Supplier=${product.supplier_code}`,
            `Product=${product.title}`,
            `Source=${product.source_key}`,
            `Variants=${product.variants.length}`,
            `Sample=${variantSummary}`,
            `Error=${publishErrorDetails(error)}`,
            `BatchError=${publishErrorDetails(groupError)}`,
          ].join(" | ").slice(0, 8_000)
          errors.push(message)
          consecutiveErrors += 1
          await onIssue?.(message)
          if (consecutiveErrors >= 10) {
            throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Publishing stopped after ${consecutiveErrors} consecutive product failures. Latest diagnostic: ${message}`)
          }
        }
      }
    }
    await onProgress?.(Math.min(index + group.length, pending.length), pending.length)
  }
  return {
    created,
    total: normalized.filter((product) => product.supplier_code === supplierCode).length,
    normalized,
    errors,
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
