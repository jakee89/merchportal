import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

export async function ensureMaltaCommerce(container: MedusaContainer, userId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(ModuleRegistrationName.FULFILLMENT) as any

  const salesChannelQuery = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: "MerchPortal Malta" },
  })
  let salesChannels: any[] = salesChannelQuery.data as any[]
  if (!salesChannels.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          { name: "MerchPortal Malta", description: "B2B merchandise portal" },
        ],
      },
    })
    salesChannels = result
  }
  const salesChannel = salesChannels[0]

  const storeQuery = await query.graph({
    entity: "store",
    fields: ["id", "name"],
  })
  let stores: any[] = storeQuery.data as any[]
  if (!stores.length) {
    const { result } = await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            name: "MerchPortal",
            supported_currencies: [{ currency_code: "eur", is_default: true }],
            default_sales_channel_id: salesChannel.id,
          },
        ],
      },
    })
    stores = result
  } else {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: stores[0].id },
        update: {
          name: "MerchPortal",
          supported_currencies: [{ currency_code: "eur", is_default: true }],
          default_sales_channel_id: salesChannel.id,
        },
      },
    })
  }

  const regionQuery = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
    filters: { name: "Malta" },
  })
  let regions: any[] = regionQuery.data as any[]
  if (!regions.length) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Malta",
            currency_code: "eur",
            countries: ["mt"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    regions = result
  }
  const region = regions[0]

  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
    filters: { country_code: "mt" },
  })
  if (!taxRegions.length) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "mt", provider_id: "tp_system" }],
    })
  }

  const locationQuery = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: "Malta Operations" },
  })
  let locations: any[] = locationQuery.data as any[]
  if (!locations.length) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Malta Operations",
            address: { city: "Malta", country_code: "MT", address_1: "" },
          },
        ],
      },
    })
    locations = result
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: locations[0].id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: locations[0].id, add: [salesChannel.id] },
    })
  }

  const keyQuery = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token", "type"],
    filters: { title: "MerchPortal Storefront" },
  })
  let keys: any[] = keyQuery.data as any[]
  if (!keys.length) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "MerchPortal Storefront",
            type: "publishable",
            created_by: userId,
          },
        ],
      },
    })
    keys = result
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: keys[0].id, add: [salesChannel.id] },
    })
  }

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
    filters: { name: "Quotation delivery" },
  })
  if (!shippingOptions.length) {
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    })
    const set = await fulfillment.createFulfillmentSets({
      name: "Malta delivery",
      type: "shipping",
      service_zones: [
        {
          name: "Malta",
          geo_zones: [{ country_code: "mt", type: "country" }],
        },
      ],
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: locations[0].id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
    })
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Quotation delivery",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: set.service_zones[0].id,
          shipping_profile_id: profiles[0].id,
          type: {
            label: "Confirmed with quotation",
            description: "Delivery charge is confirmed in the final quotation.",
            code: "quote-delivery",
          },
          prices: [
            { currency_code: "eur", amount: 0 },
            { region_id: region.id, amount: 0 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    })
  }

  return {
    store: stores[0],
    region,
    sales_channel: salesChannel,
    publishable_api_key: keys[0],
    stock_location: locations[0],
    tax_country: "mt",
    shipping_option: "Quotation delivery",
  }
}
