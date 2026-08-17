import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'list_members'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('sort_order').notNullable().defaultTo(0)
    })

    // Backfill: give each user's existing memberships a stable, distinct
    // order (by accepted/invited/created time) instead of leaving every row
    // at the column default of 0, which would make the new "reorder" feature
    // look like it randomly shuffled everyone's existing lists.
    //
    // This must run inside `defer`, not directly in `up()`: `this.schema`
    // calls are only tracked here and actually executed afterwards, so a
    // raw query run directly in `up()` would race ahead of the ALTER TABLE
    // above and fail with "no such column: sort_order".
    this.defer(async (db) => {
      const rows = await db
        .from('list_members')
        .select('id', 'user_id', 'accepted_at', 'invited_at', 'created_at')

      const byUser = new Map<number, typeof rows>()
      for (const row of rows) {
        const bucket = byUser.get(row.user_id)
        if (bucket) bucket.push(row)
        else byUser.set(row.user_id, [row])
      }

      for (const bucket of byUser.values()) {
        bucket.sort((a, b) => {
          const aTime = a.accepted_at ?? a.invited_at ?? a.created_at
          const bTime = b.accepted_at ?? b.invited_at ?? b.created_at
          return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
        })
        for (const [index, row] of bucket.entries()) {
          await db.from('list_members').where('id', row.id).update({ sort_order: index })
        }
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('sort_order')
    })
  }
}
