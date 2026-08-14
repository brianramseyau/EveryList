import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'list_members'

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
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('role').notNullable()
      table.timestamp('invited_at').notNullable()
      table.timestamp('accepted_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['list_id', 'user_id'])
    })

    // Backfill: every pre-existing list gets an `owner` membership row for
    // its current owner, so switching controllers from `ownerId` checks to
    // `list_members` lookups doesn't lock owners out of their own lists.
    const lists = await this.db.from('lists').select('id', 'owner_id', 'created_at', 'updated_at')
    if (lists.length > 0) {
      await this.db.table('list_members').multiInsert(
        lists.map((list) => ({
          list_id: list.id,
          user_id: list.owner_id,
          role: 'owner',
          invited_at: list.created_at,
          accepted_at: list.created_at,
          created_at: list.created_at,
          updated_at: list.updated_at ?? list.created_at,
        }))
      )
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
