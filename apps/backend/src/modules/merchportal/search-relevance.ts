import { type CatalogEntry } from "./catalog-filtering"

function words(value: string) {
  return (
    value
      .replace(/<[^>]*>/gu, " ")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  )
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 4 && /(?:sses|ches|shes|xes|zes)$/u.test(word))
    return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/u.test(word))
    return word.slice(0, -1)
  return word
}

function typoMatch(left: string, right: string) {
  // Short words and codes must not acquire unrelated fuzzy matches.
  if (left.length < 5 || /\d/u.test(left)) return false
  const limit = left.length >= 9 ? 2 : 1
  if (Math.abs(left.length - right.length) > limit) return false
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  let beforePrevious = previous
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(left[i - 1] !== right[j - 1]),
      )
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      )
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1)
    }
    beforePrevious = previous
    previous = current
  }
  return previous[right.length] <= limit
}

const tokenCache = new WeakMap<
  CatalogEntry,
  { primary: string[]; all: string[]; name: string[] }
>()

export function prepareSearchTokens(products: CatalogEntry[]) {
  for (const product of products) {
    if (tokenCache.has(product)) continue
    const identity = [product.name, product.category, ...(product.category_hierarchy || []), ...(product.keywords || []), ...(product.materials || []), ...(product.colors || []), product.brand, ...(product.print_methods || [])].filter(Boolean).join(" ")
    const primary = [...new Set(words(identity).map(singular))]
    tokenCache.set(product, { primary, name: words(product.name).map(singular), all: [...new Set([...primary, ...words(product.description || "").map(singular)])] })
  }
}

export function relevantSearchScores(
  products: CatalogEntry[],
  input: string,
  indexed?: Map<string, number>,
  suggestions = false,
  allowTypos = true,
) {
  const terms = words(input.trim().slice(0, 120)).map(singular)
  if (!terms.length) return new Map<string, number>()
  prepareSearchTokens(products)
  const primary = new Map<string, number>()
  const secondary = new Map<string, number>()
  const fuzzy = new Map<string, number>()
  for (const product of products) {
    if (!product.id) continue
    const tokens = tokenCache.get(product)!
    const exact = (values: string[]) =>
      terms.every(
        (term, index) =>
          values.includes(term) ||
          (suggestions &&
            index === terms.length - 1 &&
            !/\d/u.test(term) &&
            values.some((word) => word.startsWith(term))),
      )
    const score =
      (indexed?.get(product.id) || 0) +
      (tokens.name.some((word) => terms.includes(word)) ? 10 : 0)
    if (exact(tokens.primary)) primary.set(product.id, score + 100)
    else if (exact(tokens.all)) secondary.set(product.id, score)
  }
  // Preserve genuine description-only matches (some suppliers use model
  // names). Loose similarity must not dilute exact word/plural matches.
  if (primary.size || secondary.size) return new Map([...primary, ...secondary])
  // Keep deliberate partial-word searches ("backp", "rul") usable before
  // falling back to spelling correction. Code queries bypass this helper.
  const last = terms[terms.length - 1]
  if (last.length >= 3 && !/\d/u.test(last)) {
    for (const product of products) {
      if (!product.id) continue
      const tokens = tokenCache.get(product)!
      if (terms.slice(0, -1).every((term) => tokens.all.includes(term)) && tokens.all.some((word) => word.startsWith(last))) secondary.set(product.id, indexed?.get(product.id) || 0)
    }
    if (secondary.size) return secondary
  }
  if (!allowTypos) return fuzzy
  const typos = new Map<string, boolean>()
  for (const product of products) {
    if (!product.id) continue
    const tokens = tokenCache.get(product)!
    const matches = terms.every((term) =>
      tokens.primary.some((word) => {
        if (term === word) return true
        const key = `${term}:${word}`
        if (!typos.has(key)) typos.set(key, typoMatch(term, word))
        return typos.get(key)
      }),
    )
    if (matches) fuzzy.set(product.id, indexed?.get(product.id) || 0)
  }
  return fuzzy
}
