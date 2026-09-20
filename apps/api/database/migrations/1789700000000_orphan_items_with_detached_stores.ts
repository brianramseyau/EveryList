import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backfill for a bug where detaching a store from a list (StoresController#detach)
 * removed the `list_stores` pivot row but left `items.store_id` (and
 * `favorite_items.store_id`) pointing at the now-unattached store. That stale id
 * isn't valid for the row's list anymore, but nothing ever cleared it — so those
 * items silently dropped out of any store-filtered view (see `[id]/+page.svelte`'s
 * `visibleItems`) as if they'd disappeared, even though the row itself was
 * untouched. A stale favorite is the same bug with a longer fuse: every time it's
 * added to its list, FavoriteItemsController#addToList copies its `storeId`
 * straight onto the new item, reproducing the same dead reference indefinitely.
 *
 * This is a one-time backfill for data written before the controller fix: any row
 * whose `(list_id, store_id)` pair has no matching `list_stores` row gets its
 * `store_id` nulled, restoring it to every view (it becomes an ordinary unassigned
 * row rather than one hidden behind a dead store reference). `version` is bumped
 * alongside it — that's the field offline/realtime sync uses to detect a row
 * changed, so leaving it as-is would let a client still holding the pre-migration
 * copy (e.g. an open item-detail page, or a device that's been offline) write the
 * stale storeId straight back with no conflict detected. Pure data cleanup, no
 * schema change — safe to run directly against a populated production database.
 */
export default class extends BaseSchema {
  async up() {
    const attachedPairs = await this.db.from('list_stores').select('list_id', 'store_id')
    const attached = new Set(attachedPairs.map((row) => `${row.list_id}:${row.store_id}`))

    await this.orphanStaleRows('items', attached)
    await this.orphanStaleRows('favorite_items', attached)
  }

  private async orphanStaleRows(table: string, attached: Set<string>) {
    const rows = await this.db
      .from(table)
      .whereNotNull('store_id')
      .select('id', 'list_id', 'store_id')
    if (rows.length === 0) return

    const staleIds = rows
      .filter((row) => !attached.has(`${row.list_id}:${row.store_id}`))
      .map((row) => row.id)
    if (staleIds.length === 0) return

    await this.db
      .from(table)
      .whereIn('id', staleIds)
      .update({ store_id: null, version: this.db.raw('version + 1') })
  }

  async down() {
    // Data migration, not meaningfully reversible: the original (already-stale)
    // store_id values weren't preserved.
  }
}
