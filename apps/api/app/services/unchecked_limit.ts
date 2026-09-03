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
 * Also gates unchecking a previously-checked item (2026-09-03 revision, from
 * manual testing): unchecking is intake from the limit's point of view too — it
 * turns an invisible (checked) row back into an open one — so it's blocked the
 * same way when the list has no room. A list can still legitimately sit *over*
 * its limit (the limit was lowered below the current count), but only via
 * lowering the cap, never via an uncheck; every path that flips `checked` to
 * `false` must call this first. Callers decide which of their branches count as
 * intake (e.g. `store()`'s reactivate-checked branch does not, since re-adding a
 * checked item's name is itself an uncheck and goes through the same gate).
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

/** Human-facing copy for blocking an uncheck (or checked-name re-add) at a full list. */
export function limitReachedMessageForUncheck(list: List): string {
  return list.maxUncheckedItems === 1
    ? 'This list allows only 1 open item — check it off or remove it before unchecking this one.'
    : `This list allows at most ${list.maxUncheckedItems} open items — check one off or remove one before unchecking this one.`
}
