import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260928120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_published_product_source" add column "search_text" text null;')
    this.addSql(`update "merchportal_published_product_source" set "search_text" = lower(concat_ws(' ',
      catalog_preview->>'name', catalog_preview->>'description', catalog_document->>'description',
      catalog_preview->>'category', catalog_preview->>'category_paths',
      catalog_preview->>'brand', catalog_document->>'supplier_product_code',
      (select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(catalog_preview, '$.category_hierarchy[*]')) value),
      (select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(catalog_preview, '$.keywords[*]')) value),
      (select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(catalog_preview, '$.materials[*]')) value),
      (select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(catalog_preview, '$.colors[*]')) value),
      (select string_agg(value, ' ') from jsonb_array_elements_text(jsonb_path_query_array(catalog_preview, '$.print_methods[*]')) value),
      (select string_agg(concat_ws(' ', item->>'sku', item->>'color', item->>'color_group', item->>'size'), ' ')
       from jsonb_array_elements(jsonb_path_query_array(catalog_preview, '$.variants[*]')) item)
    )) where catalog_preview is not null;`)
    this.addSql('create extension if not exists pg_trgm;')
    this.addSql(`create index if not exists "IDX_merchportal_source_search_fts" on "merchportal_published_product_source" using gin (to_tsvector('english', "search_text")) where "deleted_at" is null;`)
    this.addSql('create index if not exists "IDX_merchportal_source_search_trgm" on "merchportal_published_product_source" using gin ("search_text" gin_trgm_ops) where "deleted_at" is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_merchportal_source_search_trgm";')
    this.addSql('drop index if exists "IDX_merchportal_source_search_fts";')
    this.addSql('alter table "merchportal_published_product_source" drop column "search_text";')
  }
}
