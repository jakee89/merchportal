import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260924170000 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "merchportal_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_setting_pkey" primary key ("id"));')
    this.addSql('create unique index if not exists "IDX_merchportal_setting_key" on "merchportal_setting" ("key") where "deleted_at" is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_setting" cascade;')
  }
}
