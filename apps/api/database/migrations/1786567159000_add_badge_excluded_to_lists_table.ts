import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('badge_excluded').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('badge_excluded')
    })
  }
}
