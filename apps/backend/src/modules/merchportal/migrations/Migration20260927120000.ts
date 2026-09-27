import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260927120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "merchportal_usage_daily" ("id" text not null, "actor_id" text not null, "day" text not null, "login_count" double precision not null default 0, "page_view_count" double precision not null default 0, "product_view_count" double precision not null default 0, "active_seconds" double precision not null default 0, "last_seen_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_usage_daily_pkey" primary key ("id"));')
    this.addSql('create unique index if not exists "IDX_merchportal_usage_actor_day" on "merchportal_usage_daily" ("actor_id", "day");')
    this.addSql('create index if not exists "IDX_merchportal_usage_day" on "merchportal_usage_daily" ("day") where "deleted_at" is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_usage_daily";')
  }
}
