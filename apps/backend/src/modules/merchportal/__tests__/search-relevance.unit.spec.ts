import { catalogCodeMatches } from "../catalog-filtering"
import { relevantSearchScores } from "../search-relevance"

const products = [
  {
    id: "bag",
    name: "Laptop backpack",
    category: "Bags",
    sku: "92147-131",
    description: "Padded laptop pocket",
  },
  {
    id: "model",
    name: "Oslo",
    category: "Travel",
    description: "A waterproof backpack with adjustable straps",
  },
  {
    id: "shirt",
    name: "Cotton shirt",
    category: "Clothing",
    description: "Back panel, black fabric",
    sku: "92145-103",
  },
  {
    id: "ruler",
    name: "Bamboo ruler",
    category: "Office",
    keywords: ["measuring", "stationery"],
  },
  { id: "mug", name: "Glass mug", category: "Drinkware" },
]

describe("catalogue search relevance", () => {
  it("removes unrelated loose index matches but keeps genuine description-only products", () => {
    const scores = relevantSearchScores(
      products,
      "backpack",
      new Map([
        ["shirt", 999],
        ["bag", 1],
      ]),
    )
    expect([...scores.keys()]).toEqual(["bag", "model"])
    expect(scores.get("bag")).toBeGreaterThan(scores.get("model")!)
  })
  it("treats regular plurals consistently and retains supplier keywords", () => {
    expect([...relevantSearchScores(products, "backpacks").keys()]).toEqual([
      "bag",
      "model",
    ])
    expect([...relevantSearchScores(products, "rulers").keys()]).toEqual([
      "ruler",
    ])
    expect([...relevantSearchScores(products, "measuring").keys()]).toEqual([
      "ruler",
    ])
    expect([...relevantSearchScores(products, "glasses").keys()]).toEqual([
      "mug",
    ])
  })
  it("recovers bounded typos and transpositions only when real matches are absent", () => {
    expect([...relevantSearchScores(products, "backpak").keys()]).toEqual([
      "bag",
    ])
    expect([...relevantSearchScores(products, "backapck").keys()]).toEqual([
      "bag",
    ])
    expect([...relevantSearchScores(products, "shirt").keys()]).toEqual([
      "shirt",
    ])
    expect(relevantSearchScores(products, "zzzzzzzzz").size).toBe(0)
  })
  it("requires all words rather than matching one unrelated term", () => {
    expect([
      ...relevantSearchScores(products, "laptop backpack").keys(),
    ]).toEqual(["bag"])
    expect(relevantSearchScores(products, "cotton backpack").size).toBe(0)
  })
  it("suggests partial names but never loosely recovers an exact code", () => {
    expect([...relevantSearchScores(products, "rul").keys()]).toEqual(["ruler"])
    expect([
      ...relevantSearchScores(products, "backp", undefined, true).keys(),
    ]).toEqual(["bag", "model"])
    expect([...catalogCodeMatches(products, "92147")!]).toEqual(["bag"])
    expect([...catalogCodeMatches(products, "92149")!]).toEqual([])
    expect([...catalogCodeMatches(products, "92145-103")!]).toEqual(["shirt"])
  })
})
