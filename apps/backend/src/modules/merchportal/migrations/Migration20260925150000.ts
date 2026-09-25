import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260925150000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_quote_request" add column if not exists "contact_details" jsonb null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_quote_request" drop column if exists "contact_details";')
  }
}
