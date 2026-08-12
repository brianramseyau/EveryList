import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'favorite_items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('name').notNullable()
      table
        .integer('default_category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')
      table.string('default_quantity').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['user_id', 'name'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
