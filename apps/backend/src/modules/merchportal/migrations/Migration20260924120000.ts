import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260924120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "merchportal_quote_request" ("id" text not null, "organization_id" text not null, "actor_id" text not null, "item_ids" jsonb not null, "status" text check ("status" in ('cart', 'submitted', 'quoted')) not null default 'cart', "customer_note" text null, "staff_note" text null, "estimated_total" double precision null, "final_total" double precision null, "quoted_by" text null, "submitted_at" timestamptz null, "quoted_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_quote_request_pkey" primary key ("id"));`)
    this.addSql('create index if not exists "IDX_merchportal_quote_org" on "merchportal_quote_request" ("organization_id", "created_at") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_merchportal_quote_status" on "merchportal_quote_request" ("status", "created_at") where deleted_at is null;')
    this.addSql('create unique index if not exists "IDX_merchportal_one_cart" on "merchportal_quote_request" ("organization_id") where status = \'cart\' and deleted_at is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_quote_request";')
  }
}
