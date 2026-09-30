import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260930150000 extends Migration {
  async up(): Promise<void> {
    for (const table of ["published_product_source", "pricing_rule", "supplier", "facet_mapping"]) {
      this.addSql(`create index if not exists "IDX_mp_${table}_revision" on "merchportal_${table}" ("updated_at" desc);`)
    }
    this.addSql(`create index if not exists "IDX_mp_source_related" on "merchportal_published_product_source" ("supplier_id", (catalog_preview->>'category'), "updated_at" desc) where "deleted_at" is null;`)
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_mp_source_related";')
    for (const table of ["published_product_source", "pricing_rule", "supplier", "facet_mapping"]) {
      this.addSql(`drop index if exists "IDX_mp_${table}_revision";`)
    }
  }
}
