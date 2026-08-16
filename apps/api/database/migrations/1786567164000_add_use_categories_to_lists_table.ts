import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('use_categories').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('use_categories')
    })
  }
}
