import { BaseSchema } from '@adonisjs/lucid/schema'

const TABLES = ['lists', 'categories', 'items', 'favorite_items', 'stores', 'store_category_orders']

export default class extends BaseSchema {
  async up() {
    for (const tableName of TABLES) {
      this.schema.alterTable(tableName, (table) => {
        // Bumped on every mutation; backs the offline sync queue's
        // expectedVersion/409 conflict check — see PLAN_00_FOUNDATIONAL_PLAN.md §7.
        table.integer('version').unsigned().notNullable().defaultTo(1)
      })
    }
  }

  async down() {
    for (const tableName of TABLES) {
      this.schema.alterTable(tableName, (table) => {
        table.dropColumn('version')
      })
    }
  }
}
