import type List from '#models/list'
import Item from '#models/item'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ItemRecurrence from '#models/item_recurrence'
import { nextSortOrder } from '#services/item_reuse'
import {
  hasOpenNamesake,
  nextDueDate,
  openSuccessorOf,
  spawnNextItem,
} from '#services/item_recurrence_service'
import { todayLocalIso } from '#services/deadline_notification_service'
import { countOpenSubtasks, subtasksIncompleteMessage } from '#services/subtask_completion'
import { hasCapacityFor, limitReachedMessageForUncheck } from '#services/unchecked_limit'
import { broadcastSync } from '#services/sync_broadcaster'

/**
 * The checked→unchecked / unchecked→checked transition, extracted verbatim from
 * items_controller.update's `checked` handling (foundational/PLAN_32_PHASE_MCP_SERVER.md's
 * "Shared logic" rule: business rules live in one place). The controller's own in-transaction
 * rule-edit and deadline-notification work stay there for now — this module takes only what a
 * pure checked-transition needs — but the extracted function exists so the controller can fold
 * onto it in a follow-up rather than keeping two copies of the spawn/discard transaction.
 *
 * Every MCP check/uncheck call lands here; so does every future non-HTTP path (voice/touch
 * completion already share completeItemRow for the non-recurring case — this adds the
 * recurrence-aware general form beside it).
 */

/**
 * Sets `checked` on an active item of `list`, refusing at the same gates as every other
 * client path:
 *
 * - completion of a parent with open sub-tasks (list opts into subtasks) → refused;
 * - unchecking a completed repeating item whose series has *only* the copy the check-off
 *   spawned → that copy is discarded atomically (an undo, exactly PLAN_30's invariant — the
 *   series never holds two open items), and the slot it frees means the limit isn't consulted;
 * - unchecking any other checked item turns an invisible row back into an open one — intake,
 *   so the unchecked-item limit gates it like every other intake path;
 * - completing a recurring item spawns the next copy inside the same transaction as the save,
 *   with the series' own "already completed"/"open namesake" re-checks.
 *
 * Returns the (possibly unchanged) item plus what got spawned/discarded, or a refusal.
 */
export async function setItemChecked(
  list: List,
  item: Item,
  checked: boolean
): Promise<{ refused: string } | { item: Item; spawned: Item | null; discarded: Item | null }> {
  // Nothing to do — return the row unchanged so the caller can still project it.
  if (item.checked === checked) return { item, spawned: null, discarded: null }

  // Sub-tasks gate on completion… (items_controller.update 505-513)
  if (checked && list.useSubtasks) {
    const openCount = await countOpenSubtasks(item.id)
    if (openCount > 0) return { refused: subtasksIncompleteMessage(openCount) }
  }

  // …open-item limit on uncheck, with the recurring-item undo carve-out… (476-500)
  let discarded: Item | null = null
  if (!checked && item.recurrenceId) {
    const successor = await openSuccessorOf(item)
    if (successor === 'blocked') {
      return {
        refused:
          'This repeat already has an open occurrence, so this one can’t be reopened. ' +
          'Uncheck the most recent completed occurrence instead.',
      }
    }
    discarded = successor
  }
  if (!checked && !discarded && !(await hasCapacityFor(list))) {
    return { refused: limitReachedMessageForUncheck(list) }
  }

  const wasChecked = item.checked
  item.checked = checked
  item.checkedAt = checked ? DateTime.now() : null
  item.version += 1

  // Same transaction shape as items_controller.update 551-583, minus the rule-edit half, with
  // that same entry condition: the transaction runs for an undo-discard, or for completing a
  // *recurring* item (a plain completion just saves). The "already completed"/"open namesake"
  // re-checks run inside the transaction so a concurrent check-off can't double-spawn a copy.
  const completing = checked && !wasChecked
  let spawned: Item | null = null
  if ((completing && item.recurrenceId) || discarded) {
    const sortOrder = completing ? await nextSortOrder(list, { respectInsertPosition: true }) : 0
    const today = todayLocalIso(DateTime.now())
    spawned = await db.transaction(async (trx) => {
      const alreadyCompleted = await Item.query({ client: trx })
        .where('id', item.id)
        .where('checked', true)
        .first()
      /* c8 ignore start -- defense-in-depth against a concurrent check-off that committed
       * between this call's read and the transaction opening. SQLite serializes writers, so a
       * single-process test can't order that race deterministically. */
      if (completing && alreadyCompleted) return null
      /* c8 ignore stop */
      if (discarded) {
        // Soft-deleted like `destroy`, and detached from the series so restoring or re-adding
        // it later can't bring back a second open item that repeats. (565-574)
        discarded.deletedAt = DateTime.now()
        discarded.recurrenceId = null
        discarded.version += 1
        await discarded.useTransaction(trx).save()
        await ItemRecurrence.query({ client: trx })
          .where('id', item.recurrenceId as number)
          .decrement('occurrences_created', 1)
      }
      await item.useTransaction(trx).save()
      // A namesake detached from the series is invisible to recurrenceId-based checks, so this
      // re-checks right before spawning (577-583) — the uncheck-time guard only covered the
      // reopen step, not a later recheck of the same row.
      if (completing && (await hasOpenNamesake(item, trx))) return null
      if (!completing) return null
      const nextDate = await nextDueDate(item, today, trx)
      return nextDate ? spawnNextItem(item, nextDate, sortOrder, trx) : null
    })
  } else {
    await item.save()
  }

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'update',
    version: item.version,
  })
  if (discarded) {
    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: discarded.id,
      op: 'delete',
      version: discarded.version,
    })
  }
  if (spawned) {
    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: spawned.id,
      op: 'create',
      version: spawned.version,
    })
  }

  return { item, spawned, discarded }
}
