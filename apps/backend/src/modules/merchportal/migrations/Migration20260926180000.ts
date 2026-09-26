import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260926180000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_facet_mapping" drop constraint if exists "merchportal_facet_mapping_facet_type_check";')
    this.addSql('alter table "merchportal_facet_mapping" add constraint "merchportal_facet_mapping_facet_type_check" check ("facet_type" in (\'color\', \'material\', \'category\', \'print_method\'));')
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_facet_mapping" drop constraint if exists "merchportal_facet_mapping_facet_type_check";')
    this.addSql('alter table "merchportal_facet_mapping" add constraint "merchportal_facet_mapping_facet_type_check" check ("facet_type" in (\'color\', \'material\'));')
  }
}
