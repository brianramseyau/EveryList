import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backfill for the category counterpart of 1789700000000_orphan_items_with_detached_stores:
 * `CategoriesController#destroy` soft-deleted a category but never touched `items.category_id`
 * (or `favorite_items.default_category_id`) for rows that referenced it. Unlike a detached store,
 * there's no pivot row whose disappearance a row's reference can be checked against — a category
 * is never hard-removed, so the only signal a reference is stale is the referenced row's own
 * `deleted_at` (or, defensively, the row being gone outright — e.g. if it were ever hard-deleted
 * by some other path). `getEffectiveCategories` (what the list page groups items by) filters out
 * soft-deleted categories, so a stale `category_id` doesn't just misgroup the row — the list page's
 * category grouping silently drops it (it only renders buckets for categories that query still
 * returns), while anything reading the raw item/favorite list still counts it. Same shape as the
 * store migration otherwise: a one-time backfill, `version` bumped alongside the null so a client
 * still holding the pre-migration copy can't silently write the stale id straight back. Pure data
 * cleanup, no schema change — safe to run directly against a populated production database.
 *
 * Expressed as `WHERE column NOT IN (<live category ids>)` rather than the store migration's
 * "read every row, filter in JS, `WHERE id IN (<stale ids>)`" shape: every item is normally
 * categorized (unlike the minority that have a store), so reading every categorized row into
 * memory here would mean materializing most of the table, and a large enough stale set would blow
 * past SQLite's bound-parameter limit on the `IN` list. The category count this runs against is
 * bounded by how many categories exist at all (comfortably small), not by how many rows reference
 * them, so it stays a single set-based `UPDATE` per table with no per-row read.
 */
export default class extends BaseSchema {
  async up() {
    const liveCategoryRows = await this.db.from('categories').whereNull('deleted_at').select('id')
    const liveCategoryIds = liveCategoryRows.map((row) => row.id as number)

    await this.orphanStaleRows('items', 'category_id', liveCategoryIds)
    await this.orphanStaleRows('favorite_items', 'default_category_id', liveCategoryIds)
  }

  private async orphanStaleRows(table: string, column: string, liveIds: number[]) {
    const query = this.db.from(table).whereNotNull(column)
    if (liveIds.length > 0) {
      query.whereNotIn(column, liveIds)
    }
    await query.update({ [column]: null, version: this.db.raw('version + 1') })
  }

  async down() {
    // Data migration, not meaningfully reversible: the original (already-stale)
    // category_id/default_category_id values weren't preserved.
  }
}
