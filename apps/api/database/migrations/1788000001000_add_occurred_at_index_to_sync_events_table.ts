import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sync_events'

  async up() {
    // Backs the SyncEvent retention prune (`prune_service.ts`): turns a
    // full-table scan for expired rows into an index range scan. Creating an
    // index does NOT rebuild the table in SQLite, so the ALTER TABLE +
    // foreign_keys cascade footgun in AGENTS.md does not apply here.
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['occurred_at'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['occurred_at'])
    })
  }
}
