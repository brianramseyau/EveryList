import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backfill for a bug where detaching a store from a list (StoresController#detach)
 * removed the `list_stores` pivot row but left `items.store_id` pointing at the
 * now-unattached store. That stale id isn't valid for the item's list anymore, but
 * nothing ever cleared it — so those items silently dropped out of any store-filtered
 * view (see `[id]/+page.svelte`'s `visibleItems`) as if they'd disappeared, even
 * though the row itself was untouched.
 *
 * This is a one-time backfill for data written before the controller fix: any item
 * whose `(list_id, store_id)` pair has no matching `list_stores` row gets its
 * `store_id` nulled, restoring it to every view (it becomes an ordinary unassigned
 * item rather than one hidden behind a dead store reference). Pure data cleanup, no
 * schema change — safe to run directly against a populated production database.
 */
export default class extends BaseSchema {
  async up() {
    const referencedItems = await this.db
      .from('items')
      .whereNotNull('store_id')
      .select('id', 'list_id', 'store_id')
    if (referencedItems.length === 0) return

    const attachedPairs = await this.db.from('list_stores').select('list_id', 'store_id')
    const attached = new Set(attachedPairs.map((row) => `${row.list_id}:${row.store_id}`))

    const staleItemIds = referencedItems
      .filter((item) => !attached.has(`${item.list_id}:${item.store_id}`))
      .map((item) => item.id)
    if (staleItemIds.length === 0) return

    await this.db.from('items').whereIn('id', staleItemIds).update({ store_id: null })
  }

  async down() {
    // Data migration, not meaningfully reversible: the original (already-stale)
    // store_id values weren't preserved.
  }
}
