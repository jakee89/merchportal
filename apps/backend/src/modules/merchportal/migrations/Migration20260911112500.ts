import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260911112500 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "merchportal_category_mapping" ("id" text not null, "supplier_id" text not null, "supplier_category" text not null, "suggested_category" text not null, "approved_category" text null, "confidence" double precision not null default 0, "status" text check ("status" in ('pending', 'approved', 'ignored')) not null default 'pending', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_category_mapping_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_category_mapping_source" on "merchportal_category_mapping" ("supplier_id", "supplier_category") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_merchportal_category_mapping_status" on "merchportal_category_mapping" ("status") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_pricing_rule" ("id" text not null, "scope_key" text not null, "organization_id" text null, "markup_percentage" double precision not null default 30, "status" text check ("status" in ('active', 'disabled')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_pricing_rule_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_pricing_rule_scope" on "merchportal_pricing_rule" ("scope_key") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_merchportal_pricing_rule_org" on "merchportal_pricing_rule" ("organization_id") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_published_product_source" ("id" text not null, "source_key" text not null, "product_id" text not null, "supplier_id" text not null, "cost_by_sku" jsonb not null, "lead_time" text null, "sustainable" boolean not null default false, "print_methods" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_published_product_source_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_published_product_source_key" on "merchportal_published_product_source" ("source_key") where deleted_at is null;`)
    this.addSql(`create unique index if not exists "IDX_merchportal_published_product_product" on "merchportal_published_product_source" ("product_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_merchportal_published_product_supplier" on "merchportal_published_product_source" ("supplier_id") where deleted_at is null;`)
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_published_product_source" cascade;')
    this.addSql('drop table if exists "merchportal_pricing_rule" cascade;')
    this.addSql('drop table if exists "merchportal_category_mapping" cascade;')
  }
}
