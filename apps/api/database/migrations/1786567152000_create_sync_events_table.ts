import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sync_events'

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
      table.string('entity_type').notNullable()
      // Polymorphic across list/category/item/favorite_item/store/store_category_order
      // rows — deliberately not a real FK.
      table.integer('entity_id').unsigned().notNullable()
      table.string('op').notNullable()
      table.timestamp('occurred_at').notNullable()
      table.json('payload').nullable()

      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
