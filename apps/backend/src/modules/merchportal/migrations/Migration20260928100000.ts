import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260928100000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create index if not exists "IDX_merchportal_related_products" on "merchportal_published_product_source" ("supplier_id", (("catalog_preview"->>'category')), "updated_at" desc) where "deleted_at" is null;`)
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_merchportal_related_products";')
  }
}
