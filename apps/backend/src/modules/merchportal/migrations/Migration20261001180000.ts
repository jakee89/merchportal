import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261001180000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table "merchportal_client_shortlist" ("id" text primary key, "actor_id" text not null, "organization_id" text not null, "name" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`,
    )
    this.addSql(
      `create index "IDX_mp_shortlist_owner" on "merchportal_client_shortlist" ("actor_id", "organization_id") where "deleted_at" is null;`,
    )
    this.addSql(
      `create table "merchportal_shortlist_item" ("id" text primary key, "shortlist_id" text not null, "product_id" text not null, "sku" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`,
    )
    this.addSql(
      `create unique index "IDX_mp_shortlist_item_unique" on "merchportal_shortlist_item" ("shortlist_id", "product_id", "sku") where "deleted_at" is null;`,
    )
    this.addSql(
      `create table "merchportal_email_delivery" ("id" text primary key, "recipient" text not null, "template_id" text not null, "status" text not null check ("status" in ('accepted', 'failed')), "failure_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null);`,
    )
    this.addSql(
      `create index "IDX_mp_email_delivery_time" on "merchportal_email_delivery" ("created_at" desc) where "deleted_at" is null;`,
    )
    this.addSql(
      `create index "IDX_mp_email_delivery_template" on "merchportal_email_delivery" ("template_id", "created_at" desc) where "deleted_at" is null;`,
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_email_delivery";')
    this.addSql('drop table if exists "merchportal_shortlist_item";')
    this.addSql('drop table if exists "merchportal_client_shortlist";')
  }
}
