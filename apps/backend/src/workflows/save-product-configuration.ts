import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { MERCHPORTAL_MODULE } from "../modules/merchportal";
import { sellingPrice } from "../modules/merchportal/catalog-rules";
import {
  decorationPrice,
  type DecorationMethod,
} from "../modules/merchportal/decoration";
import { resolveMarkup } from "./manage-pricing-rules";

type Input = {
  actor_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  color: string;
  branding_method?: string;
  print_position?: string;
  artwork_file_id?: string;
  artwork_filename?: string;
};

const saveConfigurationStep = createStep(
  "save-configuration",
  async (input: Input, { container }) => {
    const service = container.resolve(MERCHPORTAL_MODULE) as any;
    const memberships = await service.listMemberships(
      { actor_id: input.actor_id, actor_type: "customer", status: "active" },
      { take: 1 },
    );
    if (!memberships.length)
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Active company membership required",
      );
    if (
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > 100000
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Quantity must be between 1 and 100,000",
      );
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "variants.id",
        "variants.sku",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id: input.product_id },
    });
    const product = products[0];
    const variant = product?.variants?.find(
      (item: any) => item.id === input.variant_id,
    ) as any;
    if (!variant)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Product option no longer exists",
      );
    const sources = await service.listPublishedProductSources(
      { product_id: input.product_id },
      { take: 1 },
    );
    if (!sources.length)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Product configuration is unavailable",
      );
    const source = sources[0];
    const methods = (
      Array.isArray(source.decoration_options) ? source.decoration_options : []
    ) as DecorationMethod[];
    const method = input.branding_method
      ? methods.find((item) => item.id === input.branding_method)
      : undefined;
    if (input.branding_method && !method)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Choose an available branding method",
      );
    if (
      method &&
      input.print_position &&
      !method.positions.some((item) => item.id === input.print_position)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Choose an available print position",
      );
    }
    const cost = Number((source.cost_by_sku || {})[String(variant.sku || "")]);
    const nativePrice = Number(
      variant.prices?.find((item: any) => item.currency_code === "eur")?.amount,
    );
    const markup = await resolveMarkup(service, memberships[0].organization_id);
    const baseUnitPrice = Number.isFinite(cost)
      ? sellingPrice(cost, markup)
      : nativePrice;
    if (!Number.isFinite(baseUnitPrice))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Price is unavailable for this option",
      );
    const branding = decorationPrice(method, input.quantity);
    const total =
      Math.round(
        ((baseUnitPrice + branding.unit) * input.quantity + branding.setup) *
          100,
      ) / 100;
    const configuration = await service.createProductConfigurations({
      organization_id: memberships[0].organization_id,
      actor_id: input.actor_id,
      product_id: input.product_id,
      variant_id: input.variant_id,
      quantity: input.quantity,
      color: input.color,
      branding_method: input.branding_method || null,
      print_position: input.print_position || null,
      artwork_file_id: input.artwork_file_id || null,
      artwork_filename: input.artwork_filename || null,
      base_unit_price: baseUnitPrice,
      branding_unit_price: branding.unit,
      setup_price: branding.setup,
      estimated_total: total,
      branding_price_pending: Boolean(method) && branding.pending,
      status: input.artwork_file_id || !method ? "ready" : "draft",
    });
    return new StepResponse({
      id: configuration.id,
      base_unit_price: baseUnitPrice,
      branding_unit_price: branding.unit,
      setup_price: branding.setup,
      estimated_total: total,
      branding_price_pending: Boolean(method) && branding.pending,
      status: configuration.status,
    });
  },
);

export const saveProductConfigurationWorkflow = createWorkflow(
  "save-product-configuration",
  (input: Input) => new WorkflowResponse(saveConfigurationStep(input)),
);
