import type List from '#models/list'
import Item from '#models/item'
import { broadcastSync } from '#services/sync_broadcaster'

/** The row a name resolves to when adding it to a list: an active row if there is one, otherwise
 * the most recently deleted one. Every path that adds an item by name (manual add, bulk import,
 * favorites, Alexa) must resolve through this first, so a repeat name reuses its existing row —
 * category/store/price intact — instead of creating a duplicate. Case-insensitive and trimmed. */
export async function findItemByName(
  list: List,
  name: string
): Promise<{ item: Item; deleted: boolean } | null> {
  const normalized = name.trim().toLowerCase()

  const active = await Item.query()
    .where('listId', list.id)
    .whereNull('deletedAt')
    .whereRaw('LOWER(TRIM(name)) = ?', [normalized])
    .first()
  if (active) return { item: active, deleted: false }

  const deleted = await Item.query()
    .where('listId', list.id)
    .whereNotNull('deletedAt')
    .whereRaw('LOWER(TRIM(name)) = ?', [normalized])
    .orderBy('deletedAt', 'desc')
    .first()
  return deleted ? { item: deleted, deleted: true } : null
}

/**
 * By default appends to the end of the list. Pass `respectInsertPosition` only
 * for user-initiated adds — a fresh create or `store()`'s restore-on-name-match, but not the
 * explicit restore endpoint, imports, or moves — when the
 * owning list's `insertPosition` is `'top'`, it instead returns a value below
 * the current minimum so the new item lands first. Takes the full `list` (every
 * call site already has one in hand via `ListPolicy.requireList` or similar) so
 * `insertPosition` is read off it directly rather than re-querying the row.
 */
export async function nextSortOrder(
  list: List,
  options?: { respectInsertPosition?: boolean }
): Promise<number> {
  if (options?.respectInsertPosition && list.insertPosition === 'top') {
    const result = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .min('sort_order as minSortOrder')
      .first()
    return Number(result?.$extras.minSortOrder ?? 1) - 1
  }

  const result = await Item.query()
    .where('listId', list.id)
    .whereNull('deletedAt')
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

/** Clears `deletedAt` on an existing row (vs. creating a fresh one) so its category/store/price/
 * quantity/notes survive — shared by the explicit restore endpoint and `store()`'s implicit
 * restore-on-name-match. `respectInsertPosition` is for the latter only: typing a deleted item's
 * name is a user-initiated add, so it follows the list's add-to-top setting like a fresh create;
 * the explicit restore endpoint (undo) keeps appending. */
export async function restoreItemRow(
  list: List,
  item: Item,
  options?: { respectInsertPosition?: boolean; sortOrder?: number }
): Promise<void> {
  item.deletedAt = null
  item.checked = false
  item.checkedAt = null
  item.sortOrder = options?.sortOrder ?? (await nextSortOrder(list, options))
  item.version += 1
  await item.save()

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'create',
    version: item.version,
  })
}
