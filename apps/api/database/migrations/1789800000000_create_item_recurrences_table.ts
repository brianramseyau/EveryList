import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'item_recurrences'

  async up() {
    // One row per repeat series (PLAN_30_PHASE_RECURRING_ITEMS.md): the rule is stored once and
    // every item spawned from it points back here via items.recurrence_id. Deliberately no
    // list_id — it's item-level config; access control always goes through the item's list.
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('interval').notNullable().defaultTo(1)
      // 'day' | 'week' | 'month' | 'year'
      table.string('unit', 8).notNullable()
      // JSON array of 0 (Sunday) .. 6 (Saturday); only meaningful for 'week'. '[]' = anchor's weekday.
      table.string('weekdays', 32).notNullable().defaultTo('[]')
      // 'month' rules only: a fixed day of the month, or nth (1-4, -1 = last) + weekday. Both
      // null means "the anchor date's day of the month".
      table.integer('month_day').nullable()
      table.integer('month_nth').nullable()
      table.integer('month_weekday').nullable()
      // 'YYYY-MM-DD' — the anchor the frequency grid is generated from.
      table.string('start_date', 10).notNullable()
      // 'never' | 'on' | 'after'
      table.string('end_type', 8).notNullable().defaultTo('never')
      table.string('end_date', 10).nullable()
      table.integer('end_count').nullable()
      // Items created in this series so far (1 for the first) — the "After N" counter.
      table.integer('occurrences_created').notNullable().defaultTo(1)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    // A real FK: SET NULL so a removed series can never leave a dangling id. Adding an inline-FK
    // column makes SQLite rebuild `items`; that is safe on boot only because config/database.ts
    // leaves foreign_keys OFF for the console environment (see the AGENTS.md incident writeup) —
    // and this migration was reproduced against a seeded database before shipping.
    this.schema.alterTable('items', (table) => {
      table
        .integer('recurrence_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable(this.tableName)
        .onDelete('SET NULL')
      table.index(['recurrence_id'])
    })
  }

  async down() {
    this.schema.alterTable('items', (table) => {
      table.dropIndex(['recurrence_id'])
      table.dropColumn('recurrence_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
