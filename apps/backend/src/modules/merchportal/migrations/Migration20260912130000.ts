import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260912130000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "merchportal_import_job" drop constraint if exists "merchportal_import_job_status_check";')
    this.addSql(`alter table "merchportal_import_job" add constraint "merchportal_import_job_status_check" check ("status" in ('queued', 'running', 'cancelling', 'cancelled', 'completed', 'failed'));`)
    this.addSql('alter table "merchportal_import_job" add column if not exists "cancel_requested_at" timestamptz null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table "merchportal_import_job" drop column if exists "cancel_requested_at";')
    this.addSql('alter table "merchportal_import_job" drop constraint if exists "merchportal_import_job_status_check";')
    this.addSql(`alter table "merchportal_import_job" add constraint "merchportal_import_job_status_check" check ("status" in ('queued', 'running', 'completed', 'failed'));`)
  }
}
