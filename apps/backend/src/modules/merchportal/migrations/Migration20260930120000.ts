import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260930120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table "merchportal_media_health" ("id" text primary key, "available" boolean not null, "checked_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`)
    this.addSql(`create table "merchportal_facet_operation" ("id" text primary key, "actor_id" text not null, "facet_type" text not null, "kind" text not null, "status" text not null, "data" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`)
    this.addSql(`create index "IDX_merchportal_facet_operation_kind" on "merchportal_facet_operation" ("kind", "created_at") where "deleted_at" is null;`)
    this.addSql(`create table "merchportal_facet_value" ("id" text primary key, "supplier_id" text not null, "facet_type" text not null, "source_value" text not null, "first_seen_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`)
    this.addSql(`create unique index "IDX_merchportal_facet_value_source" on "merchportal_facet_value" ("supplier_id", "facet_type", "source_value") where "deleted_at" is null;`)
    this.addSql(`insert into "merchportal_facet_value" (id, supplier_id, facet_type, source_value, first_seen_at)
      select 'fv_' || md5(supplier_id || ':' || facet_type || ':' || source_value), supplier_id, facet_type, source_value, min(first_seen_at)
      from (
        select s.supplier_id, 'color' as facet_type, lower(trim(coalesce(v->>'color_group', v->>'color'))) as source_value, s.created_at as first_seen_at
        from merchportal_published_product_source s cross join lateral jsonb_array_elements(coalesce(s.catalog_preview->'variants', '[]')) v where s.deleted_at is null
        union all
        select s.supplier_id, fields.facet_type, lower(trim(v.value)), s.created_at
        from merchportal_published_product_source s cross join (values ('material', 'materials'), ('category', 'category_hierarchy'), ('print_method', 'print_methods')) fields(facet_type, field)
        cross join lateral jsonb_array_elements_text(coalesce(s.catalog_preview->fields.field, '[]')) v where s.deleted_at is null
        union all
        select s.supplier_id, 'category', lower(trim(s.catalog_preview->>'category')), s.created_at
        from merchportal_published_product_source s where s.deleted_at is null
        union all
        select s.supplier_id, 'category', lower(trim(level)), s.created_at
        from merchportal_published_product_source s join merchportal_supplier supplier on supplier.id = s.supplier_id and supplier.code = 'makito'
        cross join lateral jsonb_array_elements(case when jsonb_array_length(coalesce(s.catalog_preview->'category_paths', '[]')) > 0 then s.catalog_preview->'category_paths' else coalesce(s.catalog_preview->'category_hierarchy', '[]') end) path
        cross join lateral regexp_split_to_table(case when jsonb_typeof(path) = 'array' then (select string_agg(value, ' > ') from jsonb_array_elements_text(path)) when jsonb_typeof(path) = 'string' then path #>> '{}' else coalesce(path->>'name', path->>'description', path->>'title') end, '>') level
        where s.deleted_at is null and lower(trim(level)) not in ('production', 'products')
      ) values_seen where source_value is not null and source_value <> '' group by supplier_id, facet_type, source_value;`)
  }

  async down(): Promise<void> {
    this.addSql('drop table "merchportal_media_health";')
    this.addSql('drop table "merchportal_facet_value";')
    this.addSql('drop table "merchportal_facet_operation";')
  }
}
