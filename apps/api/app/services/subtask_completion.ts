import Item from '#models/item'

/**
 * Machine-readable rejection code sent in the `400` body when an item can't be
 * checked because it still has open sub-tasks — the web client matches on it
 * (via `ApiError`'s response body) to route it to a dedicated toast instead of
 * the generic error banner, the same way `unchecked_limit.ts`'s
 * `UNCHECKED_LIMIT_REACHED` is handled.
 */
export const SUBTASKS_INCOMPLETE = 'subtasks_incomplete'

/** Unchecked sub-tasks on `item` — the count that blocks checking it off. */
export async function countOpenSubtasks(itemId: number): Promise<number> {
  const result = await Item.query()
    .where('id', itemId)
    .withCount('subItems', (query) => query.where('checked', false).as('openSubtasks'))
    .firstOrFail()
  return Number(result.$extras.openSubtasks)
}

/** True once every sub-task on `itemId` is checked — including "no sub-tasks
 * at all", which callers should special-case away (auto-completing a parent
 * that never had sub-tasks isn't this feature's concern). */
export async function areAllSubtasksChecked(itemId: number): Promise<boolean> {
  return (await countOpenSubtasks(itemId)) === 0
}

export function subtasksIncompleteMessage(openCount: number): string {
  return openCount === 1
    ? 'Finish the 1 remaining sub-task before checking this off.'
    : `Finish the ${openCount} remaining sub-tasks before checking this off.`
}
