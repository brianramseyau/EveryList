import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Set only on a list-scoped category created by forking a global
      // default (see app/services/category_service.ts) — lets the merge
      // in getEffectiveCategories() shadow the exact default it replaces,
      // independent of subsequent renames.
      table
        .integer('forked_from_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('forked_from_id')
    })
  }
}
