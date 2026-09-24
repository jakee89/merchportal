import { decorationPrice, normalizeDecorationOptions, validateDecorationChoice } from "../decoration"

describe("supplier-neutral decoration normalization", () => {
  it("normalizes midocean print positions and techniques", () => {
    const methods = normalizeDecorationOptions([
      {
        printing_positions: [
          {
            position_id: "FRONT",
            print_position_type: "Rectangle",
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
            name: "FRONT",
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

  it("parses indexed Stricker options and selects the exact colour price table", () => {
    const methods = normalizeDecorationOptions(
      [{
        ProdReference: "99164",
        Component1: "Ball pen",
        Location1: "Barrel",
        ComposedLocation1: "Ball pen - Barrel",
        Area1: "60 x 20",
        Area1Image: "99164_1_1_1.png",
        TableCodes1: "PDP1",
        TableCodesOptions1: "PDP1-01-01, PDP1-01-02",
        MaxColors1: "2",
        CustomizationTypes1: "Pad Printing",
      }],
      [],
      [{
        CustomizationTables: [
          { CustomizationTypeName: "Pad Printing", TableCode: "PDP1-01", TableCodeOption: "PDP1-01-01", PriceByColor: true, MaxColors: 1, TableMaxAreaCM: "6 x 2", TableMaxAreaCM2: "12", MinQt1: 1, Price1: 1.2, MinQt2: 100, Price2: 0.8 },
          { CustomizationTypeName: "Pad Printing", TableCode: "PDP1-01", TableCodeOption: "PDP1-01-02", PriceByColor: true, MaxColors: 2, TableMaxAreaCM: "6 x 2", TableMaxAreaCM2: "12", MinQt1: 1, Price1: 2, MinQt2: 100, Price2: 1.4 },
        ],
      }],
    )

    expect(methods).toHaveLength(1)
    expect(methods[0]).toEqual(expect.objectContaining({
      id: "PDP1",
      name: "Pad Printing",
      colour_mode: "spot_colour",
      positions: [expect.objectContaining({
        id: "ball-pen-barrel",
        name: "Ball pen - Barrel",
        image_url: "99164_1_1_1.png",
        max_colours: 2,
        size_options: [expect.objectContaining({
          label: "6.0 × 2.0 cm",
          pricing_code: "PDP1-01",
        })],
      })],
    }))
    expect(decorationPrice(methods[0], 100, {
      colours: 2,
      width_mm: 60,
      height_mm: 20,
      pricing_code: "PDP1-01",
    })).toEqual({ unit: 1.4, handling: 0, setup: 0, pending: false })
  })

  it("selects the smallest Stricker embroidery table that supports the stitch count", () => {
    const methods = normalizeDecorationOptions(
      [{
        ProdReference: "99164",
        Component1: "Bag",
        Location1: "Front",
        Area1: "100 x 100",
        TableCodes1: "EMB1",
        TableCodesOptions1: "EMB1-01-A, EMB1-02-A",
        CustomizationTypes1: "Embroidery",
      }],
      [],
      [{ CustomizationTables: [
        { TableCode: "EMB1-01", TableCodeOption: "EMB1-01-A", PriceByStitches: true, MaxStitches: 5000, TableMaxAreaCM: "99.9 x 99.9", MinQt1: 1, Price1: 2 },
        { TableCode: "EMB1-02", TableCodeOption: "EMB1-02-A", PriceByStitches: true, MaxStitches: 10000, TableMaxAreaCM: "99.9 x 99.9", MinQt1: 1, Price1: 3.5 },
      ] }],
    )

    expect(methods[0].colour_mode).toBe("colourless")
    expect(methods[0].positions[0].size_options).toHaveLength(1)
    expect(decorationPrice(methods[0], 25, { stitches: 7500, pricing_code: "EMB1" })).toEqual({
      unit: 3.5,
      handling: 0,
      setup: 0,
      pending: false,
    })
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

  it("does not invent a position or price from a loose print-method label", () => {
    expect(normalizeDecorationOptions([], ["Pad printing"], [])).toEqual([])
  })

  it("parses midocean thousands-formatted quantity breaks", () => {
    const methods = normalizeDecorationOptions(
      [{ printing_positions: [{ position_id: "FRONT", printing_techniques: [{ id: "P3", name: "Pad printing", max_colours: "1" }] }] }],
      [],
      [{ print_techniques: [{ id: "P3", pricing_type: "NumberOfColours", var_costs: [{ scales: [{ minimum_quantity: "1.000", price: "0,25" }] }] }] }],
    )
    expect(methods[0].price_breaks).toEqual([{ quantity: 1000, unit_price_eur: 0.25 }])
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

  it("requires a quote when Stricker print area exceeds the selected supplier table", () => {
    const method = {
      id: "DTF1",
      name: "Digital Transfer",
      positions: [],
      price_breaks: [],
      price_tables: [{ code: "DTF1-01", option_code: "DTF1-01-A", price_by_color: false, price_by_area: true, price_by_stitches: false, max_area_cm2: 100, price_breaks: [{ quantity: 25, unit_price_eur: 1.5 }] }],
    }
    expect(decorationPrice(method, 25, { pricing_code: "DTF1-01-A", width_mm: 100, height_mm: 100 }).pending).toBe(false)
    expect(decorationPrice(method, 25, { pricing_code: "DTF1-01-A", width_mm: 200, height_mm: 200 }).pending).toBe(true)
    expect(decorationPrice(method, 10, { pricing_code: "DTF1-01-A", width_mm: 100, height_mm: 100 }).pending).toBe(true)
  })

  it("requires a quote outside midocean supplied area ranges", () => {
    const method = { id: "P", name: "Pad printing", positions: [], price_breaks: [{ quantity: 1, unit_price_eur: 1 }], price_ranges: [{ area_from_cm2: 1, area_to_cm2: 50, price_breaks: [{ quantity: 1, unit_price_eur: 1.2 }] }] }
    expect(decorationPrice(method, 100, { width_mm: 50, height_mm: 50 }).unit).toBe(1.2)
    expect(decorationPrice(method, 100, { width_mm: 100, height_mm: 100 }).pending).toBe(true)
  })

  it("checks supplier colour, size and stitch limits before quoting", () => {
    const method = {
      id: "PDP1", name: "Pad Printing", colour_mode: "spot_colour" as const, price_breaks: [],
      positions: [{ id: "front", name: "Front", max_width_mm: 60, max_height_mm: 20, max_colours: 2, size_options: [{ id: "size-1", label: "6 × 2 cm", width_mm: 60, height_mm: 20, pricing_code: "PDP1-01" }] }],
    }
    const position = method.positions[0]
    const valid = { print_colours: 2, pricing_code: "PDP1-01", print_width_mm: 60, print_height_mm: 20 }
    expect(validateDecorationChoice(method, position, valid)).toBeNull()
    expect(validateDecorationChoice(method, position, { ...valid, print_colours: 3 })).toMatch(/colours/)
    expect(validateDecorationChoice(method, position, { ...valid, pricing_code: "wrong" })).toMatch(/size/)
    expect(validateDecorationChoice(method, position, { ...valid, print_width_mm: 70 })).toMatch(/size/)
  })
})
