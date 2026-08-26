import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'items'

  async up() {
    // Backs the deleted-item TTL purge (`item_purge_service.ts`) and the
    // recently-deleted query: turns a full-table scan for expired soft-deleted
    // rows into an index range scan. Creating an index does NOT rebuild the
    // table in SQLite, so the ALTER TABLE + foreign_keys cascade footgun in
    // AGENTS.md does not apply here.
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['deleted_at'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['deleted_at'])
    })
  }
}
