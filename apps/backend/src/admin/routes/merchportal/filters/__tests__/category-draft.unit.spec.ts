import { categoryDraftParts, categoryDraftPath } from "../category-draft"

describe("category name editing", () => {
  it("preserves spaces while typing parent and child names", () => {
    const parent = "Bags & "
    const child = "Laptop "
    expect(categoryDraftParts(categoryDraftPath(parent, child))).toEqual([parent, child])
    expect(categoryDraftParts("Bags & Travel > Backpacks")).toEqual(["Bags & Travel", "Backpacks"])
    expect(categoryDraftParts("Bags>Backpacks")).toEqual(["Bags", "Backpacks"])
  })
  it("supports standalone departments and clearing the parent", () => {
    expect(categoryDraftParts("Drinkware")).toEqual(["", "Drinkware"])
    expect(categoryDraftPath("", "Drinkware")).toBe("Drinkware")
  })
})
