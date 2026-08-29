import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('use_shops').notNullable().defaultTo(true)
      table.boolean('use_favorites').notNullable().defaultTo(true)
      table.boolean('use_recent').notNullable().defaultTo(true)
      table.boolean('use_quantity').notNullable().defaultTo(true)
      table.boolean('use_price').notNullable().defaultTo(true)
      table.boolean('show_store_in_list').notNullable().defaultTo(true)
      table.boolean('show_price_in_list').notNullable().defaultTo(true)
      table.string('item_sort_order').notNullable().defaultTo('ranked')
      table.string('insert_position').notNullable().defaultTo('bottom')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('use_shops')
      table.dropColumn('use_favorites')
      table.dropColumn('use_recent')
      table.dropColumn('use_quantity')
      table.dropColumn('use_price')
      table.dropColumn('show_store_in_list')
      table.dropColumn('show_price_in_list')
      table.dropColumn('item_sort_order')
      table.dropColumn('insert_position')
    })
  }
}
