import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    // No inline FK references on either column — SQLite implements column
    // additions that carry one by rebuilding the table, and `items` has
    // ON DELETE CASCADE children (see the AGENTS.md incident writeup). Plain
    // nullable/boolean adds don't rebuild anything; config/database.ts's
    // foreign_keys-off-during-migrations guard closes the general case.
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('use_deadline').notNullable().defaultTo(false)
    })

    // ISO 8601, naive local: either 'YYYY-MM-DD' (date only) or
    // 'YYYY-MM-DDTHH:mm' (date + time). Null = no deadline. Never a Date
    // object — string comparison is the sort/ordering contract (see
    // foundational/PLAN_24_PHASE_ITEM_DEADLINES.md).
    this.schema.alterTable('items', (table) => {
      table.string('deadline', 16).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('use_deadline')
    })

    this.schema.alterTable('items', (table) => {
      table.dropColumn('deadline')
    })
  }
}
