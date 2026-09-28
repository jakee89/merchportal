import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260928140000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`update "merchportal_published_product_source" source
      set "catalog_preview" = jsonb_set(source.catalog_preview, '{variants}', coalesce((
        select jsonb_agg(
          case when jsonb_typeof(document_variant.variant->'price_breaks') = 'array'
            then jsonb_set(preview_variant.variant, '{price_breaks}', document_variant.variant->'price_breaks', true)
            else preview_variant.variant end
          order by preview_variant.position)
        from jsonb_array_elements(jsonb_path_query_array(source.catalog_preview, '$.variants[*]'))
          with ordinality as preview_variant(variant, position)
        left join lateral (
          select document_item.value as variant
          from jsonb_array_elements(jsonb_path_query_array(source.catalog_document, '$.variants[*]')) as document_item(value)
          where document_item.value->>'sku' = preview_variant.variant->>'sku' limit 1
        ) document_variant on true
      ), '[]'::jsonb), true)
      where source.catalog_preview is not null and source.catalog_document is not null and source.deleted_at is null;`)
  }

  async down(): Promise<void> {
    this.addSql(`update "merchportal_published_product_source" source
      set "catalog_preview" = jsonb_set(source.catalog_preview, '{variants}', coalesce((
        select jsonb_agg(preview_variant.variant - 'price_breaks' order by preview_variant.position)
        from jsonb_array_elements(jsonb_path_query_array(source.catalog_preview, '$.variants[*]'))
          with ordinality as preview_variant(variant, position)
      ), '[]'::jsonb), true)
      where source.catalog_preview is not null and source.deleted_at is null;`)
  }
}
