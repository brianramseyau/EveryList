import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.string('icon').notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      // Nullable = global default category, seeded once and visible to every list.
      table
        .integer('list_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('lists')
        .onDelete('CASCADE')
      table.boolean('is_default').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
