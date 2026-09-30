import { selectProposal } from "../proposal-selection"

describe("AI proposal selection", () => {
  const available = [0, 1, 3, 4, 5]
  it("toggles individual proposals and selects forward or reverse Shift-click ranges", () => {
    expect(selectProposal([], available, 1, undefined, false)).toEqual([1])
    expect(selectProposal([1], available, 1, undefined, false)).toEqual([])
    expect(selectProposal([0, 1], available, 4, 1, true)).toEqual([0, 1, 3, 4])
    expect(selectProposal([5], available, 1, 5, true)).toEqual([5, 1, 3, 4])
  })
  it("clears ranges, skips applied groups and handles a missing anchor", () => {
    expect(selectProposal([0, 1, 3, 4, 5], available, 4, 1, true)).toEqual([0, 5])
    expect(selectProposal([1], available, 4, 2, true)).toEqual([1, 4])
    expect(selectProposal([1], available, 2, 1, true)).toEqual([1])
    expect(selectProposal([1, 2], available, 4, 1, true)).toEqual([1, 3, 4])
  })
  it("selects more than 100 proposals in a range", () => {
    const ids = Array.from({ length: 501 }, (_, id) => id)
    expect(selectProposal([0], ids, 500, 0, true)).toEqual(ids)
    expect(selectProposal(ids, ids, 500, 0, true)).toEqual([])
  })
})
