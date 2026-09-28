import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type SearchRow = { product_id: string; rank: number | string; similarity: number | string }

export async function catalogSearchScores(container: any, input: string): Promise<Map<string, number> | undefined> {
  const search = input.trim().slice(0, 120)
  if (search.length < 3) return
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const pattern = `%${search.replace(/[!%_]/g, "!$&")}%`
  const rows = await knex("merchportal_published_product_source")
    .select("product_id")
    .select(knex.raw("ts_rank_cd(to_tsvector('english', search_text), websearch_to_tsquery('english', ?)) as rank", [search]))
    .select(knex.raw("word_similarity(?, search_text) as similarity", [search]))
    .whereNull("deleted_at")
    .whereNotNull("search_text")
    .where(function (this: any) {
      this.whereRaw("to_tsvector('english', search_text) @@ websearch_to_tsquery('english', ?)", [search])
        .orWhereRaw("search_text ilike ? escape '!'", [pattern])
        .orWhereRaw("? <% search_text", [search])
    }) as SearchRow[]
  return new Map(rows.map((row) => [row.product_id, Number(row.rank) + Number(row.similarity)]))
}
