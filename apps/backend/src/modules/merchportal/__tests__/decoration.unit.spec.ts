import { decorationPrice, normalizeDecorationOptions } from "../decoration"

describe("supplier-neutral decoration normalization", () => {
  it("normalizes midocean print positions and techniques", () => {
    const methods = normalizeDecorationOptions([
      {
        printing_positions: [
          {
            position_id: "FRONT",
            print_position_type: "Front",
            max_print_size_width: 80,
            max_print_size_height: 50,
            images: [{ variant_color: "Red", print_position_image_with_area: "https://images.cdn.midocean.com/front-red.png" }],
            printing_techniques: [{ id: "S1", name: "Screen print", max_colours: 4 }],
          },
        ],
      },
    ])
    expect(methods).toEqual([
      expect.objectContaining({
        id: "S1",
        name: "Screen print",
        positions: [
          expect.objectContaining({
            name: "Front",
            max_width_mm: 80,
            max_colours: 4,
            images: [{ variant_color: "Red", url: "https://images.cdn.midocean.com/front-red.png" }],
          }),
        ],
      }),
    ])
  })

  it("normalizes Stricker-style technique and location rows", () => {
    const methods = normalizeDecorationOptions([
      {
        CustomizationTableOptions: [
          {
            CustomizationType: "Laser engraving",
            ServiceCode: "LAS",
            Location: "Barrel",
            LocationMaxPrintingAreaMM: { width_mm: 45, height_mm: 6 },
          },
        ],
      },
    ])
    expect(methods[0]).toEqual(
      expect.objectContaining({
        id: "LAS",
        name: "Laser engraving",
        positions: [expect.objectContaining({ name: "Barrel", max_width_mm: 45, max_height_mm: 6 })],
      }),
    )
  })

  it("keeps Stricker CustomizationOptions position, technique, image, and allowed size together", () => {
    const methods = normalizeDecorationOptions([
      {
        CustomizationOptions: [
          {
            ProdReference: "99164",
            Component: "Ball pen",
            Location: "Barrel",
            ComposedLocation: "Ball pen - Barrel",
            CustomizationTypeName: "Digital UV",
            TableCode: "DUV1-01",
            TableCodeOption: "DUV1-01-01",
            TableMaxAreaCM: "6 x 2",
            LocationMaxPrintingAreaMM: "60 x 20",
            MaxColors: 4,
            AreaImage: "99164_103_C1_L1_DUV1.png",
          },
        ],
      },
    ])

    expect(methods).toHaveLength(1)
    expect(methods[0]).toEqual(expect.objectContaining({
      id: "DUV1",
      name: "Digital UV",
      positions: [expect.objectContaining({
        id: "ball-pen-barrel",
        name: "Ball pen - Barrel",
        max_width_mm: 60,
        max_height_mm: 20,
        max_colours: 4,
        image_url: "99164_103_C1_L1_DUV1.png",
        size_options: [expect.objectContaining({
          id: "DUV1-01-01",
          label: "6.0 × 2.0 cm",
          width_mm: 60,
          height_mm: 20,
        })],
      })],
    }))
  })

  it("uses the best eligible quantity price break", () => {
    expect(
      decorationPrice(
        {
          id: "print",
          name: "Print",
          positions: [],
          price_breaks: [
            { quantity: 25, unit_price_eur: 2 },
            { quantity: 100, unit_price_eur: 1.25 },
          ],
          setup_price_eur: 20,
        },
        150,
      ),
    ).toEqual({ unit: 1.25, handling: 0, setup: 20, pending: false })
  })

  it("joins supplier print-price scales to a technique", () => {
    const methods = normalizeDecorationOptions(
      [
        {
          printing_positions: [
            {
              position_id: "FRONT",
              print_position_type: "Front",
              printing_techniques: [{ id: "B", name: "Embossing" }],
            },
          ],
        },
      ],
      [],
      [
        {
          print_techniques: [
            {
              id: "B",
              setup: "60,00",
              pricing_type: "NumberOfColours",
              next_colour_cost_indicator: "X",
              var_costs: [
                {
                  scales: [
                    {
                      minimum_quantity: "1",
                      price: "1,56",
                      next_price: "0,50",
                    },
                    {
                      minimum_quantity: "50",
                      price: "0,94",
                      next_price: "0,30",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    )
    expect(methods[0]).toEqual(
      expect.objectContaining({
        setup_price_eur: 60,
        pricing_type: "NumberOfColours",
        next_colour_cost_indicator: true,
        price_breaks: [
          { quantity: 1, unit_price_eur: 1.56, next_colour_price_eur: 0.5 },
          { quantity: 50, unit_price_eur: 0.94, next_colour_price_eur: 0.3 },
        ],
      }),
    )
    expect(decorationPrice(methods[0], 60, { colours: 3 })).toEqual({
      unit: 1.54,
      handling: 0,
      setup: 180,
      pending: false,
    })
  })

  it("adds midocean handling and the ST white underbase only to print cost", () => {
    const method = {
      id: "ST",
      name: "Screen transfer",
      positions: [],
      pricing_type: "NumberOfColours",
      next_colour_cost_indicator: true,
      setup_price_eur: 10,
      handling_price_breaks: [{ quantity: 1, unit_price_eur: 0.4 }],
      price_breaks: [{ quantity: 1, unit_price_eur: 1, next_colour_price_eur: 0.5 }],
    }
    expect(decorationPrice(method, 25, { colours: 2, color_code: "03" })).toEqual({
      unit: 2,
      handling: 0.4,
      setup: 20,
      pending: false,
    })
    expect(decorationPrice(method, 25, { colours: 2, color_code: "WW" }).unit).toBe(1.5)
  })
})
