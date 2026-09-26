import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260926120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_published_product_source" add column if not exists "catalog_preview" jsonb null;')
    this.addSql(`
      update "merchportal_published_product_source" source
      set "catalog_preview" = jsonb_build_object(
        'id', document->'id',
        'name', document->'name',
        'description', coalesce(nullif(document->>'short_description', ''), document->>'description'),
        'image_url', document->'image_url',
        'category', document->'category',
        'category_hierarchy', document->'category_hierarchy',
        'colors', document->'colors',
        'materials', document->'materials',
        'brand', document->'brand',
        'lead_time', document->'lead_time',
        'sustainable', document->'sustainable',
        'print_methods', document->'print_methods',
        'keywords', document->'keywords',
        'stock_quantity', document->'stock_quantity',
        'variants', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'sku', variant->'sku',
            'color', variant->'color',
            'color_group', variant->'color_group',
            'color_hex', variant->'color_hex',
            'stock_quantity', variant->'stock_quantity',
            'images', case when jsonb_typeof(variant->'images') = 'array' and jsonb_array_length(variant->'images') > 0 then jsonb_build_array(variant->'images'->0) else '[]'::jsonb end,
            'future_stock', case when jsonb_typeof(variant->'future_stock') = 'array' and jsonb_array_length(variant->'future_stock') > 0 then jsonb_build_array(variant->'future_stock'->0) else '[]'::jsonb end
          )),'[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(document->'variants') = 'array' then document->'variants' else '[]'::jsonb end) variant
        )
      )
      from (select id, catalog_document as document from "merchportal_published_product_source" where catalog_document is not null) saved
      where source.id = saved.id and source.catalog_preview is null;
    `)
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_published_product_source" drop column if exists "catalog_preview";')
  }
}
