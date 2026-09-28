import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260928130000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_supplier" add column "catalog_priority" integer not null default 9999;')
    this.addSql(`with ordered as (
      select id, row_number() over (order by display_name, id) as priority
      from "merchportal_supplier" where deleted_at is null
    ) update "merchportal_supplier" supplier
      set "catalog_priority" = ordered.priority
      from ordered where supplier.id = ordered.id;`)
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_supplier" drop column "catalog_priority";')
  }
}
