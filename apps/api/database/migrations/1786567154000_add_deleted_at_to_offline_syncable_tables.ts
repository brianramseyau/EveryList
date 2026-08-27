import { BaseSchema } from '@adonisjs/lucid/schema'

const TABLES = ['categories', 'favorite_items', 'stores', 'store_category_orders']

export default class extends BaseSchema {
  async up() {
    for (const tableName of TABLES) {
      this.schema.alterTable(tableName, (table) => {
        // Soft-delete so an offline delete-then-sync resolves as a
        // versioned update (row still exists) rather than an
        // unreconcilable hard delete — see PLAN_00_FOUNDATIONAL_PLAN.md §7, PLAN_05_PHASE_OFFLINE_PWA.md §1.
        table.timestamp('deleted_at').nullable()
      })
    }
  }

  async down() {
    for (const tableName of TABLES) {
      this.schema.alterTable(tableName, (table) => {
        table.dropColumn('deleted_at')
      })
    }
  }
}
