import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'list_stores'

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
        .integer('store_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('stores')
        .onDelete('CASCADE')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['list_id', 'store_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
