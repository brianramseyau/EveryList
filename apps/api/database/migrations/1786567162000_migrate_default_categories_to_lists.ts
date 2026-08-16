import { BaseSchema } from '@adonisjs/lucid/schema'
import { DateTime } from 'luxon'

/**
 * Retires global default categories (`categories.list_id IS NULL`). They
 * used to be merged into every list's category set on the fly (see
 * getEffectiveCategories in app/services/category_service.ts), which made
 * them impossible to delete from a list that didn't want them and meant
 * every list — todo lists, packing lists, anything non-grocery — carried
 * grocery aisle categories it never asked for.
 *
 * This migration materializes a real, list-scoped copy of each global
 * default onto every existing list (skipping lists that already forked
 * that default via a prior customization), reassigns any items still
 * pointing at the global row to the new list-scoped one, then deletes the
 * global rows outright. After this, default categories only get created
 * once, directly on a brand-new user's first list — see
 * app/services/list_creation.ts.
 */
export default class extends BaseSchema {
  async up() {
    const defaults = await this.db.from('categories').whereNull('list_id')
    if (defaults.length === 0) return

    const lists = await this.db.from('lists').select('id')
    const now = DateTime.now().toSQL()

    for (const list of lists) {
      const existingForks = await this.db
        .from('categories')
        .where('list_id', list.id)
        .whereNotNull('forked_from_id')
        .select('forked_from_id')
      const shadowedDefaultIds = new Set(existingForks.map((row) => row.forked_from_id))

      for (const def of defaults) {
        if (shadowedDefaultIds.has(def.id)) continue

        const [newId] = await this.db.table('categories').insert({
          list_id: list.id,
          name: def.name,
          icon: def.icon,
          sort_order: def.sort_order,
          is_default: false,
          forked_from_id: null,
          version: 1,
          created_at: now,
          updated_at: now,
        })

        await this.db
          .from('items')
          .where('list_id', list.id)
          .where('category_id', def.id)
          .update({ category_id: newId })
      }
    }

    await this.db.from('categories').whereNull('list_id').delete()
  }

  async down() {
    // Data migration, not meaningfully reversible: the per-list copies
    // created here would need to be de-duplicated back into shared globals.
  }
}
