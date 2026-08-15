import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('folder_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('folders')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('folder_id')
    })
  }
}
