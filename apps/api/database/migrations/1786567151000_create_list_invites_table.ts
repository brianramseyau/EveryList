import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'list_invites'

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
      table.string('token').notNullable().unique()
      table.string('role').notNullable()
      table
        .integer('created_by')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.timestamp('expires_at').nullable()
      table.timestamp('revoked_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
