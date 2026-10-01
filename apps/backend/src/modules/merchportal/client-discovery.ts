import { MedusaError } from "@medusajs/framework/utils"
import { catalogMetadata, catalogRevision } from "./catalog-data"
import { preparedCatalog } from "./catalog-prepared"
import { searchCatalog } from "./catalog-search"
import { catalogCodeMatches } from "./catalog-filtering"
import { compareSupplierPriority } from "./supplier-priority"

export function catalogCardData(product: any, selectedSku?: string) {
  const {
    id,
    supplier_code,
    name,
    description,
    sku,
    image_url,
    category,
    brand,
    sustainable,
    price_eur,
    price_from_quantity,
    has_price_tiers,
    stock_quantity,
    color_option_count,
  } = product
  const seen = new Set<string>()
  const selected = selectedSku
    ? product.filter_variants?.find(
        (variant: any) => variant.sku === selectedSku,
      )
    : undefined
  const color_options = [...(product.color_options || [])]
    .sort(
      (left: any, right: any) =>
        Number(right.sku === selectedSku) - Number(left.sku === selectedSku),
    )
    .filter((option: any) => {
      const key = String(option.name).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
    .map((option: any) => {
      const {
        name,
        color_hex,
        image_url,
        sku,
        price_eur,
        price_from_quantity,
        has_price_tiers,
        stock_quantity,
        next_arrival,
      } = option
      return {
        name,
        color_hex,
        image_url,
        sku,
        price_eur,
        price_from_quantity,
        has_price_tiers,
        stock_quantity,
        next_arrival,
      }
    })
  return {
    id,
    supplier_code,
    name,
    description,
    sku: selectedSku || sku,
    image_url,
    category,
    brand,
    sustainable,
    price_eur: selected?.price_eur ?? price_eur,
    price_from_quantity,
    has_price_tiers,
    stock_quantity: selected?.stock_quantity ?? stock_quantity,
    color_option_count,
    color_options,
  }
}

export async function discoveryCatalog(
  container: any,
  service: any,
  organizationId: string,
) {
  const revision = await catalogRevision(container)
  const products = await preparedCatalog(
    container,
    service,
    organizationId,
    revision,
    Boolean(organizationId),
  )
  return {
    products,
    revision: `${organizationId}:${revision.source}:${revision.settings}`,
  }
}

function nameValue(input: unknown) {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 80)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Enter a name of 1–80 characters",
    )
  return input.trim()
}

export async function ownedShortlist(
  service: any,
  actorId: string,
  organizationId: string,
  id: string,
) {
  const [list] = await service.listClientShortlists(
    { id, actor_id: actorId, organization_id: organizationId },
    { take: 1 },
  )
  if (!list)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Shortlist not found")
  return list
}

export async function clientShortlists(
  service: any,
  actorId: string,
  organizationId: string,
  products: any[],
) {
  const lists = await service.listClientShortlists(
    { actor_id: actorId, organization_id: organizationId },
    { take: 20, order: { created_at: "DESC" } },
  )
  const items = lists.length
    ? await service.listShortlistItems(
        { shortlist_id: lists.map((list: any) => list.id) },
        { take: 4000, order: { created_at: "ASC" } },
      )
    : []
  const byId = new Map(products.map((product) => [product.id, product]))
  return lists.map((list: any) => ({
    id: list.id,
    name: list.name,
    items: items
      .filter((item: any) => item.shortlist_id === list.id)
      .map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        sku: item.sku,
        product: byId
          .get(item.product_id)
          ?.filter_variants?.some((variant: any) => variant.sku === item.sku)
          ? catalogCardData(byId.get(item.product_id), item.sku)
          : null,
      })),
  }))
}

export async function changeShortlist(
  service: any,
  actorId: string,
  organizationId: string,
  input: any,
  products: any[],
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid shortlist request",
    )
  if (input.action === "create") {
    const [, count] = await service.listAndCountClientShortlists(
      { actor_id: actorId, organization_id: organizationId },
      { take: 1 },
    )
    if (count >= 20)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "You can keep up to 20 shortlists",
      )
    return service.createClientShortlists({
      actor_id: actorId,
      organization_id: organizationId,
      name: nameValue(input.name),
    })
  }
  if (typeof input.id !== "string")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a shortlist")
  const list = await ownedShortlist(service, actorId, organizationId, input.id)
  if (input.action === "rename")
    return service.updateClientShortlists({
      id: list.id,
      name: nameValue(input.name),
    })
  if (input.action === "delete") {
    const items = await service.listShortlistItems(
      { shortlist_id: list.id },
      { take: 200 },
    )
    if (items.length)
      await service.deleteShortlistItems(items.map((item: any) => item.id))
    await service.deleteClientShortlists(list.id)
    return
  }
  if (input.action === "remove") {
    const [item] = await service.listShortlistItems(
      { id: String(input.item_id), shortlist_id: list.id },
      { take: 1 },
    )
    if (!item)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Shortlist item not found",
      )
    await service.deleteShortlistItems(item.id)
    return
  }
  if (input.action !== "add")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Unknown shortlist action",
    )
  const product = products.find((product) => product.id === input.product_id)
  const sku = typeof input.sku === "string" ? input.sku : ""
  if (
    !product ||
    !sku ||
    !product.filter_variants?.some((variant: any) => variant.sku === sku)
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Choose an available product option",
    )
  const [existing] = await service.listShortlistItems(
    { shortlist_id: list.id, product_id: product.id, sku },
    { take: 1 },
  )
  if (existing) return existing
  const [, count] = await service.listAndCountShortlistItems(
    { shortlist_id: list.id },
    { take: 1 },
  )
  if (count >= 200)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A shortlist can contain up to 200 products",
    )
  try {
    return await service.createShortlistItems({
      shortlist_id: list.id,
      product_id: product.id,
      sku,
    })
  } catch (error) {
    // Concurrent clicks are idempotent; the unique index decides the winner.
    const [saved] = await service.listShortlistItems(
      { shortlist_id: list.id, product_id: product.id, sku },
      { take: 1 },
    )
    if (saved) return saved
    throw error
  }
}

export async function featuredCollections(service: any) {
  const [setting] = await service.listPortalSettings(
    { key: "featured-collections" },
    { take: 1 },
  )
  return Array.isArray(setting?.value?.collections)
    ? setting.value.collections
    : []
}

export async function saveFeaturedCollections(
  service: any,
  input: unknown,
  products: any[],
  actorId: string,
) {
  if (!Array.isArray(input) || input.length > 5)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Use up to five featured collections",
    )
  const available = new Set(products.map((product) => product.id))
  const collections = input.map((collection) => {
    if (
      !Array.isArray(collection.product_ids) ||
      collection.product_ids.length > 20 ||
      collection.product_ids.some(
        (id: unknown) => typeof id !== "string" || !available.has(id),
      )
    )
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Choose up to 20 published products per collection",
      )
    return {
      label: nameValue(collection.label),
      enabled: collection.enabled === true,
      product_ids: [...new Set(collection.product_ids)],
    }
  })
  const key = "featured-collections"
  const value = { collections, updated_by: actorId }
  const [setting] = await service.listPortalSettings({ key }, { take: 1 })
  if (setting) await service.updatePortalSettings({ id: setting.id, value })
  else await service.createPortalSettings({ key, value })
  return collections
}

export async function discoverySuggestions(
  container: any,
  service: any,
  products: any[],
  revision: string,
  input: unknown,
) {
  const q = typeof input === "string" ? input.trim().slice(0, 120) : ""
  if (q.length < 2) return { products: [], categories: [] }
  const scores = await searchCatalog(container, products, q, revision, true)
  const metadata = await catalogMetadata(
    service,
    (await catalogRevision(container)).settings,
  )
  const priorities = new Map<string, number>(
    metadata.suppliers.map((supplier: any) => [
      supplier.id,
      supplier.catalog_priority,
    ]),
  )
  const matched = products
    .filter((product) => scores.has(product.id))
    .sort(
      (left, right) =>
        compareSupplierPriority(
          left.supplier_id,
          right.supplier_id,
          priorities,
        ) ||
        scores.get(right.id)! - scores.get(left.id)! ||
        left.name.localeCompare(right.name),
    )
  const code = catalogCodeMatches(products, q, 2)
  const categories = code
    ? []
    : [
        ...new Set(
          matched
            .flatMap(
              (product) => product.category_hierarchy || [product.category],
            )
            .filter(
              (category) =>
                typeof category === "string" &&
                category.toLowerCase().includes(q.toLowerCase()),
            ),
        ),
      ].slice(0, 4)
  return {
    products: matched.slice(0, 6).map((product) => ({
      id: product.id,
      name: product.name,
      sku: code
        ? product.filter_variants?.find((variant: any) =>
            String(variant.sku).toLowerCase().startsWith(q.toLowerCase()),
          )?.sku || product.sku
        : product.sku,
    })),
    categories,
  }
}
