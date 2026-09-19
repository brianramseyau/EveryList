import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sub_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('item_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('items')
        .onDelete('CASCADE')
      table.string('name').notNullable()
      table.boolean('checked').notNullable().defaultTo(false)
      table.timestamp('checked_at').nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table
        .integer('created_by')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.integer('version').notNullable().defaultTo(1)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['item_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
