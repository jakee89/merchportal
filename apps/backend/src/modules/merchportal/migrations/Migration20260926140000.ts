import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260926140000 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "merchportal_facet_mapping" ("id" text not null, "supplier_id" text not null, "facet_type" text check ("facet_type" in (\'color\', \'material\')) not null, "source_value" text not null, "target_value" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "merchportal_facet_mapping_pkey" primary key ("id"));')
    this.addSql('create unique index if not exists "IDX_merchportal_facet_mapping_source" on "merchportal_facet_mapping" ("supplier_id", "facet_type", "source_value") where "deleted_at" is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "merchportal_facet_mapping" cascade;')
  }
}
