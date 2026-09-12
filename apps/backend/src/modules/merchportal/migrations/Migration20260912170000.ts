import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260912170000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_product_configuration" add column if not exists "decoration_lines" jsonb null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_product_configuration" drop column if exists "decoration_lines";')
  }
}
