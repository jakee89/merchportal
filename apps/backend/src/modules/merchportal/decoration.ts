import { fieldValue } from "./catalog-rules";

type AnyObject = Record<string, any>;

export type DecorationPosition = {
  id: string;
  name: string;
  max_width_mm?: number;
  max_height_mm?: number;
  max_colours?: number;
};

export type DecorationMethod = {
  id: string;
  name: string;
  positions: DecorationPosition[];
  price_breaks: Array<{ quantity: number; unit_price_eur: number }>;
  setup_price_eur?: number;
};

function number(value: unknown) {
  const parsed = Number(
    typeof value === "string" ? value.replace(",", ".") : value,
  );
  return Number.isFinite(parsed) ? parsed : undefined;
}

function key(object: AnyObject, names: string[]) {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return Object.entries(object).find(([name]) =>
    accepted.has(name.toLowerCase()),
  )?.[1];
}

function objects(value: unknown, output: AnyObject[] = []) {
  if (Array.isArray(value)) value.forEach((child) => objects(child, output));
  else if (value && typeof value === "object") {
    output.push(value as AnyObject);
    Object.values(value as AnyObject).forEach((child) =>
      objects(child, output),
    );
  }
  return output;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "standard"
  );
}

function priceBreaks(candidate: AnyObject) {
  const breaks: Array<{ quantity: number; unit_price_eur: number }> = [];
  for (const item of objects(candidate)) {
    const quantity = number(
      key(item, [
        "quantity",
        "minimum_quantity",
        "min_quantity",
        "from_quantity",
        "qty",
      ]),
    );
    const price = number(
      key(item, ["printing_price", "print_price", "unit_price", "price_eur"]),
    );
    if (
      quantity !== undefined &&
      price !== undefined &&
      quantity > 0 &&
      price >= 0
    ) {
      breaks.push({ quantity: Math.floor(quantity), unit_price_eur: price });
    }
  }
  return breaks
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.quantity === item.quantity) === index,
    )
    .sort((left, right) => left.quantity - right.quantity);
}

export function normalizeDecorationOptions(
  payloads: unknown[],
  fallbackMethods: string[] = [],
) {
  const methods = new Map<string, DecorationMethod>();
  const add = (
    methodName: string,
    methodId: string,
    position: DecorationPosition,
    candidate: AnyObject,
  ) => {
    const id = methodId || slug(methodName);
    const current = methods.get(id) || {
      id,
      name: methodName || id,
      positions: [],
      price_breaks: [],
    };
    if (!current.positions.some((item) => item.id === position.id))
      current.positions.push(position);
    const prices = priceBreaks(candidate);
    if (prices.length) current.price_breaks = prices;
    const setup = number(
      key(candidate, [
        "setup_price",
        "setup_cost",
        "handling_cost",
        "handlingcost",
      ]),
    );
    if (setup !== undefined) current.setup_price_eur = setup;
    methods.set(id, current);
  };

  for (const candidate of payloads.flatMap((payload) => objects(payload))) {
    const positionName = fieldValue(candidate, [
      "print_position_type",
      "position_name",
      "position",
      "location_name",
      "location",
      "customization_area",
      "customisation_area",
      "area",
    ]);
    const techniques = key(candidate, [
      "printing_techniques",
      "customization_techniques",
      "customisation_techniques",
    ]);
    if (positionName && Array.isArray(techniques)) {
      for (const technique of techniques) {
        if (!technique || typeof technique !== "object") continue;
        const methodName =
          fieldValue(technique, [
            "name",
            "description",
            "technique_name",
            "customization_type",
            "customisation_type",
            "customizationtype",
            "customisationtype",
          ]) ||
          fieldValue(technique, ["id"]) ||
          "Branding";
        const methodId =
          fieldValue(technique, [
            "id",
            "code",
            "service_code",
            "servicecode",
          ]) || slug(methodName);
        add(
          methodName,
          methodId,
          {
            id:
              fieldValue(candidate, [
                "position_id",
                "location_id",
                "location_code",
                "id",
              ]) || slug(positionName),
            name: positionName,
            max_width_mm: number(
              key(candidate, [
                "max_print_size_width",
                "max_width_mm",
                "width_mm",
                "width",
              ]),
            ),
            max_height_mm: number(
              key(candidate, [
                "max_print_size_height",
                "max_height_mm",
                "height_mm",
                "height",
              ]),
            ),
            max_colours: number(
              key(technique, [
                "max_colours",
                "max_colors",
                "colours",
                "colors",
              ]),
            ),
          },
          technique,
        );
      }
      continue;
    }

    const methodName = fieldValue(candidate, [
      "technique_name",
      "printing_technique",
      "customization_type",
      "customisation_type",
      "customizationtype",
      "customisationtype",
      "customizationtypename",
      "customisationtypename",
      "technique",
    ]);
    if (methodName && positionName) {
      add(
        methodName,
        fieldValue(candidate, [
          "technique_id",
          "service_code",
          "servicecode",
          "code",
        ]) || slug(methodName),
        {
          id:
            fieldValue(candidate, [
              "position_id",
              "location_id",
              "location_code",
            ]) || slug(positionName),
          name: positionName,
          max_width_mm: number(
            key(candidate, [
              "max_print_size_width",
              "max_width_mm",
              "width_mm",
            ]),
          ),
          max_height_mm: number(
            key(candidate, [
              "max_print_size_height",
              "max_height_mm",
              "height_mm",
            ]),
          ),
          max_colours: number(
            key(candidate, ["max_colours", "max_colors", "colours", "colors"]),
          ),
        },
        candidate,
      );
    }
  }

  for (const methodName of fallbackMethods) {
    const id = slug(methodName);
    if (!methods.has(id))
      methods.set(id, {
        id,
        name: methodName,
        positions: [{ id: "standard", name: "Standard position" }],
        price_breaks: [],
      });
  }
  return [...methods.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function decorationPrice(
  method: DecorationMethod | undefined,
  quantity: number,
) {
  if (!method?.price_breaks.length)
    return { unit: 0, setup: method?.setup_price_eur || 0, pending: true };
  const selected =
    [...method.price_breaks]
      .filter((item) => item.quantity <= quantity)
      .sort((left, right) => right.quantity - left.quantity)[0] ||
    method.price_breaks[0];
  return {
    unit: selected.unit_price_eur,
    setup: method.setup_price_eur || 0,
    pending: false,
  };
}
