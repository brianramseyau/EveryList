import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'alexa_preferences'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('show_checked').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('show_checked')
    })
  }
}
