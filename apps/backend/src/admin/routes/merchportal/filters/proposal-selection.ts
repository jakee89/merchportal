// Use displayed order, excluding already applied proposals, for Shift-click ranges.
export function selectProposal(current: number[], available: number[], id: number, anchor: number | undefined, shift: boolean) {
  if (!available.includes(id)) return current
  const from = anchor === undefined ? -1 : available.indexOf(anchor)
  const to = available.indexOf(id)
  const range = shift && from >= 0 ? available.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
  const next = new Set(current.filter((value) => available.includes(value)))
  if (next.has(id)) range.forEach((value) => next.delete(value))
  else range.forEach((value) => next.add(value))
  return [...next]
}
