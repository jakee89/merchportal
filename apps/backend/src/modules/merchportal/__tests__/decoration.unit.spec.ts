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
        positions: [expect.objectContaining({ name: "Barrel" })],
      }),
    )
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
    ).toEqual({ unit: 1.25, setup: 20, pending: false })
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
      setup: 180,
      pending: false,
    })
  })
})
