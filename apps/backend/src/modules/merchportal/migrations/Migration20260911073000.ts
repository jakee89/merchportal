import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260911073000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "merchportal_organization" ("id" text not null, "name" text not null, "slug" text not null, "join_code" text null, "status" text check ("status" in ('active', 'disabled')) not null default 'active', "logo_url" text null, "primary_color" text not null default '#0b6ffb', "secondary_color" text not null default '#0b2545', "billing_address" jsonb null, "shipping_address" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_organization_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_organization_slug" on "merchportal_organization" ("slug") where deleted_at is null;`)
    this.addSql(`create unique index if not exists "IDX_merchportal_organization_join_code" on "merchportal_organization" ("join_code") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_membership" ("id" text not null, "organization_id" text null, "actor_id" text not null, "actor_type" text check ("actor_type" in ('user', 'customer')) not null, "role" text check ("role" in ('super_admin', 'staff', 'client_admin', 'client_buyer', 'client_viewer')) not null, "permissions" jsonb null, "status" text check ("status" in ('active', 'disabled')) not null default 'active', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_membership_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_membership_actor" on "merchportal_membership" ("actor_type", "actor_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_merchportal_membership_org" on "merchportal_membership" ("organization_id") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_supplier" ("id" text not null, "code" text not null, "display_name" text not null, "status" text check ("status" in ('active', 'disabled')) not null default 'active', "credential_env_var" text not null, "product_sync_at" timestamptz null, "price_sync_at" timestamptz null, "stock_sync_at" timestamptz null, "last_error" text null, "configuration" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_supplier_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_supplier_code" on "merchportal_supplier" ("code") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_import_job" ("id" text not null, "supplier_id" text not null, "kind" text check ("kind" in ('catalog', 'price', 'stock')) not null, "trigger" text check ("trigger" in ('manual', 'scheduled')) not null, "status" text check ("status" in ('queued', 'running', 'completed', 'failed')) not null, "processed" integer not null default 0, "created_count" integer not null default 0, "updated_count" integer not null default 0, "skipped_count" integer not null default 0, "error_count" integer not null default 0, "started_at" timestamptz null, "completed_at" timestamptz null, "error_message" text null, "log" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_import_job_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_merchportal_import_job_supplier" on "merchportal_import_job" ("supplier_id", "created_at") where deleted_at is null;`)
    this.addSql(`create table if not exists "merchportal_raw_supplier_record" ("id" text not null, "supplier_id" text not null, "import_job_id" text not null, "record_type" text check ("record_type" in ('product', 'price', 'stock', 'category')) not null, "external_id" text not null, "sku" text null, "checksum" text not null, "payload" jsonb not null, "source_image_urls" jsonb null, "first_seen_at" timestamptz not null, "last_seen_at" timestamptz not null, "source_updated_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_raw_supplier_record_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_merchportal_raw_record_source" on "merchportal_raw_supplier_record" ("supplier_id", "record_type", "external_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_merchportal_raw_record_sku" on "merchportal_raw_supplier_record" ("sku") where deleted_at is null;`)
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_raw_supplier_record" cascade;')
    this.addSql('drop table if exists "merchportal_import_job" cascade;')
    this.addSql('drop table if exists "merchportal_supplier" cascade;')
    this.addSql('drop table if exists "merchportal_membership" cascade;')
    this.addSql('drop table if exists "merchportal_organization" cascade;')
  }
}
