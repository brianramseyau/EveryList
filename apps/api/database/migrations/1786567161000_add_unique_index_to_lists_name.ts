import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lists'

  async up() {
    this.schema.raw(
      `CREATE UNIQUE INDEX lists_owner_id_name_unique
       ON ${this.tableName} (owner_id, LOWER(TRIM(name)))
       WHERE deleted_at IS NULL`
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS lists_owner_id_name_unique')
  }
}
