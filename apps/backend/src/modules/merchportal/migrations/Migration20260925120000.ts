import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260925120000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_pricing_rule" add column if not exists "quantity_tiers" jsonb null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_pricing_rule" drop column if exists "quantity_tiers";')
  }
}
