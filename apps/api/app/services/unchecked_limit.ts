import type List from '#models/list'
import Item from '#models/item'
import logger from '@adonisjs/core/services/logger'

/**
 * Machine-readable rejection code sent in the `400` body of every intake path
 * this service gates — the web client matches on it (via `ApiError`'s response
 * body) to tailor UI copy without string-matching on the human message.
 */
export const UNCHECKED_LIMIT_REACHED = 'unchecked_limit_reached'

/** Unchecked ("open") items currently on the list — the count the limit caps. */
export async function countUncheckedItems(listId: number): Promise<number> {
  // An aggregate always yields exactly one row, so firstOrFail can't throw here —
  // and using it (instead of first + a nullish fallback) keeps the branch coverage
  // honest about that.
  const result = await Item.query()
    .where('listId', listId)
    .whereNull('deletedAt')
    .where('checked', false)
    .count('id as total')
    .firstOrFail()
  return Number(result.$extras.total)
}

/** Slots left before the cap, or `null` when the list has no limit. Never negative. */
export async function remainingCapacity(list: List): Promise<number | null> {
  const max = list.maxUncheckedItems
  if (max === null) return null
  return Math.max(0, max - (await countUncheckedItems(list.id)))
}

/**
 * Whether the list can admit `incomingCount` more unchecked items. `null`
 * (or missing) `maxUncheckedItems` means unlimited — the default, and the shape
 * every pre-Phase-25 list row has.
 *
 * Deliberately NOT enforced as a maintained invariant: a list may sit over its
 * limit (the limit was lowered below the current count, or an item was unchecked
 * while full). Only *intake* — actions that make a new/invisible row appear as
 * an unchecked item — is gated; unchecking a checked item never is. Callers
 * decide which of their branches count as intake (e.g. `store()`'s
 * reactivate-checked branch does not).
 */
export async function hasCapacityFor(list: List, incomingCount = 1): Promise<boolean> {
  const remaining = await remainingCapacity(list)
  if (remaining === null) return true

  const fits = incomingCount <= remaining
  if (!fits) {
    logger.debug(
      { listId: list.id, remaining, incomingCount },
      'unchecked-item limit reached, intake rejected'
    )
  }
  return fits
}

/** Human-facing copy for a full list — matches `UNCHECKED_LIMIT_REACHED`'s 400 body. */
export function limitReachedMessage(list: List): string {
  return list.maxUncheckedItems === 1
    ? 'This list allows only 1 open item — check it off to add more.'
    : `This list allows at most ${list.maxUncheckedItems} open items — check one off to add more.`
}
