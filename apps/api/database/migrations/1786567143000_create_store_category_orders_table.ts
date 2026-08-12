import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'store_category_orders'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('store_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('stores')
        .onDelete('CASCADE')
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('categories')
        .onDelete('CASCADE')
      table.integer('sort_order').notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['store_id', 'category_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
