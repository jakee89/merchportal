import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911153000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "merchportal_published_product_source" add column if not exists "decoration_options" jsonb null;',
    );
    this.addSql(
      'alter table "merchportal_raw_supplier_record" drop constraint if exists "merchportal_raw_supplier_record_record_type_check";',
    );
    this.addSql(
      `alter table "merchportal_raw_supplier_record" add constraint "merchportal_raw_supplier_record_record_type_check" check ("record_type" in ('product', 'price', 'stock', 'category', 'decoration'));`,
    );
    this.addSql(
      `create table if not exists "merchportal_product_configuration" ("id" text not null, "organization_id" text not null, "actor_id" text not null, "product_id" text not null, "variant_id" text not null, "quantity" integer not null, "color" text not null, "branding_method" text null, "print_position" text null, "artwork_file_id" text null, "artwork_filename" text null, "base_unit_price" double precision not null, "branding_unit_price" double precision not null default 0, "setup_price" double precision not null default 0, "estimated_total" double precision not null, "branding_price_pending" boolean not null default false, "status" text check ("status" in ('draft', 'ready')) not null default 'draft', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_product_configuration_pkey" primary key ("id"));`,
    );
    this.addSql(
      'create index if not exists "IDX_merchportal_configuration_org" on "merchportal_product_configuration" ("organization_id", "created_at") where deleted_at is null;',
    );
    this.addSql(
      'create index if not exists "IDX_merchportal_configuration_actor" on "merchportal_product_configuration" ("actor_id", "created_at") where deleted_at is null;',
    );
    this.addSql(
      'create index if not exists "IDX_merchportal_configuration_product" on "merchportal_product_configuration" ("product_id") where deleted_at is null;',
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'drop table if exists "merchportal_product_configuration" cascade;',
    );
    this.addSql(
      'alter table "merchportal_published_product_source" drop column if exists "decoration_options";',
    );
    this.addSql(
      'alter table "merchportal_raw_supplier_record" drop constraint if exists "merchportal_raw_supplier_record_record_type_check";',
    );
    this.addSql(
      `alter table "merchportal_raw_supplier_record" add constraint "merchportal_raw_supplier_record_record_type_check" check ("record_type" in ('product', 'price', 'stock', 'category'));`,
    );
  }
}
