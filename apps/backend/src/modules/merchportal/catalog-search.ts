import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { catalogCodeMatches, type CatalogEntry } from "./catalog-filtering"
import { relevantSearchScores } from "./search-relevance"
import { portalReadCache } from "./read-cache"

type SearchRow = { product_id: string; rank: number | string }

export async function searchCatalog(container: any, products: CatalogEntry[], input: string, revision: string, suggestions = false) {
  const code = catalogCodeMatches(products, input, suggestions ? 2 : 4)
  if (code) return new Map([...code].map((id) => [id, 1000]))
  return portalReadCache.get<Map<string, number>>(`relevant-search:${suggestions}:${revision}:${input.trim().toLowerCase().slice(0, 120)}`, 30_000, async () => {
    let indexed: Map<string, number> | undefined
    if (!suggestions) {
      try { indexed = await catalogSearchScores(container, input) } catch { /* Safe relevance matching also works during index outages. */ }
    }
    let scores = relevantSearchScores(products, input, indexed, suggestions, !indexed?.size)
    if (suggestions && !scores.size) {
      try { indexed = await catalogSearchScores(container, input) } catch { /* Typing suggestions remain optional during index outages. */ }
      if (indexed?.size) scores = relevantSearchScores(products, input, indexed, true, false)
    }
    if (indexed?.size) {
      // These are now genuine full-text/literal matches, not loose trigram
      // candidates. Preserve matches from complete supplier descriptions
      // and indexed attributes omitted from the lightweight card preview.
      const visible = new Set(products.map((product) => product.id))
      for (const [id, score] of indexed) if (visible.has(id) && !scores.has(id)) scores.set(id, score)
    }
    return scores
  })
}

export async function catalogSearchScores(container: any, input: string): Promise<Map<string, number> | undefined> {
  const search = input.trim().slice(0, 120)
  if (search.length < 3) return
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const pattern = `%${search.replace(/[!%_]/g, "!$&")}%`
  const rows = await knex("merchportal_published_product_source")
    .select("product_id")
    .select(knex.raw("ts_rank_cd(to_tsvector('english', search_text), websearch_to_tsquery('english', ?)) as rank", [search]))
    .whereNull("deleted_at")
    .whereNotNull("search_text")
    .where(function (this: any) {
      this.whereRaw("to_tsvector('english', search_text) @@ websearch_to_tsquery('english', ?)", [search])
        .orWhereRaw("search_text ilike ? escape '!'", [pattern])
    }) as SearchRow[]
  return new Map(rows.map((row) => [row.product_id, Number(row.rank)]))
}
