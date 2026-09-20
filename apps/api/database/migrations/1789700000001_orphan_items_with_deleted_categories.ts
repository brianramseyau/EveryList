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
 */
export default class extends BaseSchema {
  async up() {
    const categoryRows = await this.db.from('categories').select('id', 'deleted_at')
    const liveCategoryIds = new Set(
      categoryRows.filter((row) => row.deleted_at === null).map((row) => row.id)
    )

    await this.orphanStaleRows('items', 'category_id', liveCategoryIds)
    await this.orphanStaleRows('favorite_items', 'default_category_id', liveCategoryIds)
  }

  private async orphanStaleRows(table: string, column: string, liveIds: Set<number>) {
    const rows = await this.db.from(table).whereNotNull(column).select('id', column)
    if (rows.length === 0) return

    const staleIds = rows.filter((row) => !liveIds.has(row[column])).map((row) => row.id)
    if (staleIds.length === 0) return

    await this.db
      .from(table)
      .whereIn('id', staleIds)
      .update({ [column]: null, version: this.db.raw('version + 1') })
  }

  async down() {
    // Data migration, not meaningfully reversible: the original (already-stale)
    // category_id/default_category_id values weren't preserved.
  }
}
