import { BaseSchema } from '@adonisjs/lucid/schema'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { groupCategoryLearningsFromItems } from '#services/category_learning_backfill'
import { DateTime } from 'luxon'

/**
 * The learned auto-categorization model (PHASE17_PLAN.md) — a dedicated
 * table replacing the item-derived frequency heuristic. One row per
 * (list, token, category), where `count` is how many times a user has
 * explicitly assigned that category to an item whose name contains that
 * token, and `last_seen_at` drives exponential half-life decay. Rows are
 * never deleted (an *uncontested* association always wins regardless of
 * decay), so this is a `CREATE`-only migration with no `ALTER` — and no
 * cascade footgun (see AGENTS.md).
 */
export default class extends BaseSchema {
  protected tableName = 'category_learnings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('list_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('lists')
        .onDelete('CASCADE')
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('categories')
        .onDelete('CASCADE')
      table.string('token').notNullable()
      table.integer('count').notNullable().defaultTo(1)
      table.timestamp('last_seen_at').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.unique(['list_id', 'token', 'category_id'])
    })

    // `this.schema.createTable` is deferred — the DDL only runs once `up()`
    // returns — so the backfill must run through `this.defer` too, in the
    // order it's tracked, or its inserts hit a table that doesn't exist yet.
    this.defer((db) => this.backfill(db))
  }

  /**
   * Seeds the model from every historical item (including soft-deleted
   * ones). The seed can't distinguish a category that was explicitly chosen
   * from one that was auto-suggested, and is accepted as such (see
   * PHASE17_PLAN.md's "backfill all existing history" decision).
   */
  private async backfill(db: QueryClientContract) {
    const items = await db.from('items').whereNotNull('category_id')

    const groups = groupCategoryLearningsFromItems(
      items.map((item) => ({
        listId: item.list_id,
        categoryId: item.category_id,
        name: item.name,
        lastSeenAt: item.updated_at ?? item.created_at,
      }))
    )

    const now = DateTime.now().toSQL()
    for (const group of groups) {
      await db.table(this.tableName).insert({
        list_id: group.listId,
        category_id: group.categoryId,
        token: group.token,
        count: group.count,
        last_seen_at: group.lastSeenAt,
        created_at: now,
        updated_at: now,
      })
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
