import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260911190000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_import_job" add column if not exists "phase" text not null default \'queued\';')
    this.addSql('alter table "merchportal_import_job" add column if not exists "current_message" text null;')
    this.addSql('alter table "merchportal_import_job" add column if not exists "total_records" integer not null default 0;')
    this.addSql('alter table "merchportal_import_job" add column if not exists "progress_percent" integer not null default 0;')
    this.addSql('alter table "merchportal_published_product_source" add column if not exists "attributes" jsonb null;')
    this.addSql('alter table "merchportal_published_product_source" add column if not exists "catalog_document" jsonb null;')
    this.addSql('alter table "merchportal_product_configuration" add column if not exists "print_colours" integer null;')
    this.addSql('alter table "merchportal_product_configuration" add column if not exists "print_width_mm" integer null;')
    this.addSql('alter table "merchportal_product_configuration" add column if not exists "print_height_mm" integer null;')
    this.addSql('alter table "merchportal_raw_supplier_record" drop constraint if exists "merchportal_raw_supplier_record_record_type_check";')
    this.addSql(`alter table "merchportal_raw_supplier_record" add constraint "merchportal_raw_supplier_record_record_type_check" check ("record_type" in ('product', 'price', 'stock', 'category', 'decoration', 'decoration_price'));`)
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_product_configuration" drop column if exists "print_height_mm";')
    this.addSql('alter table "merchportal_product_configuration" drop column if exists "print_width_mm";')
    this.addSql('alter table "merchportal_product_configuration" drop column if exists "print_colours";')
    this.addSql('alter table "merchportal_raw_supplier_record" drop constraint if exists "merchportal_raw_supplier_record_record_type_check";')
    this.addSql(`alter table "merchportal_raw_supplier_record" add constraint "merchportal_raw_supplier_record_record_type_check" check ("record_type" in ('product', 'price', 'stock', 'category', 'decoration'));`)
    this.addSql('alter table "merchportal_published_product_source" drop column if exists "catalog_document";')
    this.addSql('alter table "merchportal_published_product_source" drop column if exists "attributes";')
    this.addSql('alter table "merchportal_import_job" drop column if exists "progress_percent";')
    this.addSql('alter table "merchportal_import_job" drop column if exists "total_records";')
    this.addSql('alter table "merchportal_import_job" drop column if exists "current_message";')
    this.addSql('alter table "merchportal_import_job" drop column if exists "phase";')
  }
}
