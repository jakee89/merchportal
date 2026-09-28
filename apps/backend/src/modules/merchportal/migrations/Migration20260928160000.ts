import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260928160000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`with corrected as (
      select source.id,
        jsonb_agg(jsonb_set(method.value, '{handling_price_breaks}',
          jsonb_build_array(jsonb_build_object('quantity', 1,
            'unit_price_eur', replace(manipulation.value->>'price', ',', '.')::numeric)), true)
          order by method.position) as decoration_options
      from merchportal_published_product_source source
      join merchportal_supplier supplier on supplier.id = source.supplier_id
        and supplier.code = 'midocean' and supplier.deleted_at is null
      join merchportal_raw_supplier_record decoration on decoration.supplier_id = source.supplier_id
        and decoration.record_type = 'decoration' and decoration.deleted_at is null
        and decoration.external_id = split_part(source.catalog_document->>'supplier_product_code', '-', 1)
      join merchportal_raw_supplier_record prices on prices.supplier_id = source.supplier_id
        and prices.record_type = 'decoration_price' and prices.deleted_at is null
      join lateral jsonb_array_elements(coalesce(prices.payload->'print_manipulations', '[]'::jsonb))
        manipulation(value) on manipulation.value->>'code' = decoration.payload->>'print_manipulation'
      cross join lateral jsonb_array_elements(case when jsonb_typeof(source.decoration_options) = 'array'
        then source.decoration_options else '[]'::jsonb end) with ordinality method(value, position)
      where source.deleted_at is null
        and jsonb_typeof(source.decoration_options) = 'array'
        and replace(manipulation.value->>'price', ',', '.') ~ '^[0-9]+([.][0-9]+)?$'
      group by source.id
    )
    update merchportal_published_product_source source
    set decoration_options = corrected.decoration_options
    from corrected where source.id = corrected.id;`)
  }

  async down(): Promise<void> {
    // Supplier-price corrections cannot be safely reversed to the incorrect imported values.
  }
}
