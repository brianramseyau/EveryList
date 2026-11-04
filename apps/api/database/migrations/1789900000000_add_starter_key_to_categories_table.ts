import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Phase B of PLAN_37_PHASE_AUTO_CATEGORIZATION_REFINEMENTS.md: give seeded starter categories a
 * stable identity that survives renames, so the static keyword fallback no longer resolves by
 * display name.
 *
 * Deliberately **no backfill**: nothing on a category records whether it was created by
 * `seedStarterCategories` (`is_default` is false for seeds too), so a name/icon match could label a
 * user-created category as a starter. Pre-existing rows stay `null` and are served by the learned
 * tier instead. The column is a plain nullable string with no inline FK — the safe ALTER shape.
 */
export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('starter_key').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('starter_key')
    })
  }
}
