import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'backup_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('frequency').notNullable().defaultTo('weekly')
      table.string('time_of_day').notNullable().defaultTo('03:00')
      // A count, not a day window — see backup_service.ts for why: pruning by
      // count guarantees the newest backup of a given kind is never at risk
      // of being pruned away before the next due-check reads it.
      table.integer('retention_count').notNullable().defaultTo(4)
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
