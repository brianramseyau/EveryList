import type List from '#models/list'
import Item from '#models/item'
import Category from '#models/category'
import DeadlineNotificationSend from '#models/deadline_notification_send'
import ListPolicy from '#policies/list_policy'
import {
  createItemValidator,
  updateItemValidator,
  importItemsValidator,
  moveItemValidator,
  moveItemToListValidator,
} from '#validators/item'
import type { HttpContext } from '@adonisjs/core/http'
import ItemTransformer from '#transformers/item_transformer'
import { learnCategory, suggestCategoryId } from '#services/category_suggestion_service'
import { parseBulkImport } from '#services/bulk_import_parser'
import { matchCategoryIcon, titleCaseCategoryName } from '#services/category_bulk_import'
import type { CategorizeSuggestionDto } from '@everylist/shared'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { todayLocalIso } from '#services/deadline_notification_service'
import ItemRecurrence from '#models/item_recurrence'
import {
  hasOpenNamesake,
  nextDueDate,
  openSuccessorOf,
  ruleFromPayload,
  spawnNextItem,
  upsertRecurrence,
} from '#services/item_recurrence_service'
import { broadcastSync } from '#services/sync_broadcaster'
import { findItemByName, nextSortOrder, restoreItemRow } from '#services/item_reuse'
import {
  UNCHECKED_LIMIT_REACHED,
  hasCapacityFor,
  limitReachedMessage,
  limitReachedMessageForUncheck,
  remainingCapacity,
} from '#services/unchecked_limit'
import {
  SUBTASKS_INCOMPLETE,
  subtasksIncompleteMessage,
  countOpenSubtasks,
} from '#services/subtask_completion'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'

async function resolveCategoryId(
  list: List,
  itemName: string,
  explicitCategoryId?: number | null
): Promise<number | null> {
  if (explicitCategoryId !== undefined) return explicitCategoryId

  return suggestCategoryId(list, itemName)
}

// Mirrors apps/web/src/lib/item-sort-order.ts's computeMidpointSortOrder exactly: only the
// moved item's own sortOrder ever changes, to a value strictly between its new neighbors'
// *existing* sortOrder values (fractional indexing) — never a shared/derived index. No other
// row is touched, so there's nothing to collide with and no fan-out of version bumps to other
// items (this app's offline sync queue does per-row optimistic-locking on `version`, so
// touching every sibling on every move would risk spurious conflicts for concurrent edits on
// other devices). Kept in sync with the frontend's copy rather than shared, since one is
// TypeScript-in-a-Node-service and the other TypeScript-in-a-Vite-bundle with no shared runtime
// package between them for a five-line pure function.
export function computeMidpointSortOrder(
  before: number | undefined,
  after: number | undefined
): number {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** Loads `item`'s repeat rule so every single-item response carries it — a response without it
 * would let a client that replaces its cached row wholesale drop a stored rule. */
async function withRecurrence(item: Item): Promise<Item> {
  // A row created in this request hasn't been re-read, so its FK is `undefined` (not `null`), which
  // Lucid refuses to load a relation from — it has no rule by definition.
  if (item.recurrenceId === undefined) item.$setRelated('recurrence', null)
  else await item.load('recurrence')
  return item
}

export default class ItemsController {
  async index({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    const includeChecked = request.input('includeChecked', 'true') !== 'false'
    const query = Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .preload('subItems', (subItemsQuery) => subItemsQuery.orderBy('sortOrder', 'asc'))
      .preload('recurrence')
    if (!includeChecked) query.where('checked', false)

    const items = await query.orderBy('sortOrder', 'asc')
    return serialize(ItemTransformer.transform(items))
  }

  /** Backs the client's optimistic-row category guess — see PLAN_07_PHASE_POLISH.md §3. */
  async categorize({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    const name = request.input('name', '')
    const body: CategorizeSuggestionDto = { categoryId: await suggestCategoryId(list, name) }

    return response.ok(body)
  }

  async recent({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    const items = await Item.query()
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .preload('recurrence')
      .orderBy('deletedAt', 'desc')
      .limit(50)

    return serialize(ItemTransformer.transform(items))
  }

  /** Distinct item names from this list's full history (incl. checked/deleted), most recent first — backs autocomplete. */
  async recentNames({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    // Ordered by last use, not creation: re-adding a name reuses its existing row (unchecking or
    // restoring it), so `createdAt` never moves and would age out staples like "Beer" no matter
    // how often they're bought. Timestamps have only second-level precision, so ties are common —
    // break them by id desc. Unbounded on purpose: autocomplete filters client-side, and a cap
    // would silently hide older names from suggestions (a list's distinct names stay small).
    const rows = await Item.query()
      .where('listId', list.id)
      .orderByRaw('COALESCE(updated_at, created_at) DESC')
      .orderBy('id', 'desc')
      .select('name')

    const seen = new Set<string>()
    const names: string[] = []
    for (const row of rows) {
      const key = row.name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(row.name.trim())
    }

    // `serialize()` only wraps Lucid models/transformer output — a plain
    // string[] falls through its isObject() check and returns unwrapped,
    // so the {data: ...} envelope has to be built by hand here.
    return response.ok({ data: names })
  }

  async store({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const payload = await request.validateUsing(createItemValidator)

    logger.debug({ listId: list.id, name: payload.name }, 'item store requested')

    // Validated up front so a malformed or deadline-less rule is rejected the same way whether or not
    // the name matches an existing row. On a name match `store()` is get-or-create: the existing row
    // is returned as-is and — like every other field in the payload (deadline, price, notes …) —
    // the rule is only applied when a row is actually created.
    let recurrenceRule = null
    if (payload.recurrence) {
      const parsed = ruleFromPayload(payload.recurrence)
      if ('problem' in parsed) return response.unprocessableEntity({ message: parsed.problem })
      if (!payload.deadline) {
        return response.unprocessableEntity({ message: 'A repeating item needs a deadline.' })
      }
      recurrenceRule = parsed.rule
    }

    const match = await findItemByName(list, payload.name)
    const existing = match && !match.deleted ? match.item : null

    if (existing) {
      if (existing.checked) {
        // Re-adding a checked item's name unchecks it — the same "make a checked
        // row open again" transition as the checkbox, so it's gated the same way
        // (2026-09-03 revision): otherwise typing the name back in would bypass the
        // checkbox's own limit gate.
        if (!(await hasCapacityFor(list))) {
          return response.badRequest({
            message: limitReachedMessageForUncheck(list),
            code: UNCHECKED_LIMIT_REACHED,
          })
        }
        existing.checked = false
        existing.checkedAt = null
        existing.version += 1
        await existing.save()

        await broadcastSync({
          listId: list.id,
          entityType: 'item',
          entityId: existing.id,
          op: 'update',
          version: existing.version,
        })

        logger.debug(
          { listId: list.id, itemId: existing.id },
          'item store matched existing checked item, reactivated'
        )
      }

      return serialize(ItemTransformer.transform(await withRecurrence(existing)))
    }

    // No active match — re-adding a name that was deleted restores its old row (category, store,
    // price, quantity, notes intact) rather than silently creating a metadata-less duplicate. See
    // AGENTS.md's "Re-adding a deleted item's name" footgun.
    const deletedMatch = match?.deleted ? match.item : null

    if (deletedMatch) {
      // Restoring a soft-deleted row brings an invisible item back as unchecked —
      // intake, so the open-item limit gates it too (same as the reactivate-checked
      // branch above).
      if (!(await hasCapacityFor(list))) {
        return response.badRequest({
          message: limitReachedMessage(list),
          code: UNCHECKED_LIMIT_REACHED,
        })
      }
      await restoreItemRow(list, deletedMatch, { respectInsertPosition: true })
      logger.debug(
        { listId: list.id, itemId: deletedMatch.id },
        'item store matched deleted item, restored'
      )
      return serialize(ItemTransformer.transform(await withRecurrence(deletedMatch)))
    }

    const categoryId = await resolveCategoryId(list, payload.name, payload.categoryId)

    // Checked as late as possible — right before the insert — to keep the
    // count-then-insert race window as small as the duplicate-name check's.
    if (!(await hasCapacityFor(list))) {
      return response.badRequest({
        message: limitReachedMessage(list),
        code: UNCHECKED_LIMIT_REACHED,
      })
    }

    const sortOrder = await nextSortOrder(list, { respectInsertPosition: true })
    // The item and its series commit together — a failure can't leave a rule with no item.
    const item = await db.transaction(async (trx) => {
      const created = await Item.create(
        {
          listId: list.id,
          name: payload.name,
          quantity: payload.quantity ?? null,
          notes: payload.notes ?? null,
          categoryId,
          storeId: payload.storeId ?? null,
          price: payload.price ?? null,
          deadline: payload.deadline ?? null,
          checked: false,
          sortOrder,
          createdBy: user.id,
          version: 1,
        },
        { client: trx }
      )
      if (recurrenceRule) {
        await upsertRecurrence(created, recurrenceRule, trx)
        await created.useTransaction(trx).save()
      }
      return created
    })

    // Only an *explicit* category choice teaches the model — never the
    // auto-suggestion itself (PLAN_17_PHASE_LEARNED_AUTO_CATEGORIZATION.md's self-reinforcement guard).
    if (typeof payload.categoryId === 'number') {
      await learnCategory(list, payload.name, payload.categoryId)
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'create',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id }, 'item created')

    return serialize(ItemTransformer.transform(await withRecurrence(item)))
  }

  async import({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const { text } = await request.validateUsing(importItemsValidator)

    const parsed = parseBulkImport(text)
    logger.debug(
      { listId: list.id, sectionCount: parsed.sections.length },
      'item bulk import requested'
    )

    // Every line resolves by name first (same as `store()`): an open item is left alone, a
    // checked one is unchecked, a deleted one is restored, and only an unknown name is created —
    // so re-importing a list never duplicates. Names repeated within the paste resolve once.
    const matches = new Map<string, Awaited<ReturnType<typeof findItemByName>>>()
    for (const section of parsed.sections) {
      for (const parsedItem of section.items) {
        const key = parsedItem.name.trim().toLowerCase()
        if (!matches.has(key)) matches.set(key, await findItemByName(list, parsedItem.name))
      }
    }

    // The import is atomic in spirit — every line ends up open — so it's gated as a whole
    // rather than partially applied up to the cap. Only lines that add an open row count
    // toward it (an already-open match takes no slot). The message says how much would have fit.
    const incomingCount = [...matches.values()].filter(
      (match) => match === null || match.deleted || match.item.checked
    ).length
    const remaining = await remainingCapacity(list)
    if (remaining !== null && incomingCount > remaining) {
      return response.badRequest({
        message: `Bulk import would exceed this list's limit of ${list.maxUncheckedItems} open items (${remaining} slot${remaining === 1 ? '' : 's'} left).`,
        code: UNCHECKED_LIMIT_REACHED,
      })
    }

    // Section headers become the item's category — an existing category with
    // the same name (case-insensitive) is reused, otherwise a new one is
    // created so the AnyList category structure carries over wholesale.
    const categoryIdsByHeader = new Map<string, number>()
    const maxCategorySortOrder = await Category.query()
      .where('listId', list.id)
      .max('sort_order as maxSortOrder')
      .first()
    let categorySortOrder = Number(maxCategorySortOrder?.$extras.maxSortOrder ?? -1) + 1

    async function resolveSectionCategory(header: string | null): Promise<number | null> {
      if (!header) return null
      const key = header.trim().toLowerCase()
      if (categoryIdsByHeader.has(key)) return categoryIdsByHeader.get(key)!

      const existing = await Category.query()
        .where('listId', list.id)
        .whereNull('deletedAt')
        .whereRaw('LOWER(TRIM(name)) = ?', [key])
        .first()
      if (existing) {
        categoryIdsByHeader.set(key, existing.id)
        return existing.id
      }

      const category = await Category.create({
        listId: list.id,
        name: titleCaseCategoryName(header),
        icon: matchCategoryIcon(header),
        sortOrder: categorySortOrder++,
        isDefault: false,
        version: 1,
      })
      await broadcastSync({
        listId: list.id,
        entityType: 'category',
        entityId: category.id,
        op: 'create',
        version: category.version,
      })
      logger.debug(
        { listId: list.id, categoryId: category.id, header },
        'created category from import section header'
      )
      categoryIdsByHeader.set(key, category.id)
      return category.id
    }

    let sortOrder = await nextSortOrder(list)
    const items: Item[] = []
    for (const section of parsed.sections) {
      const sectionCategoryId = await resolveSectionCategory(section.header)
      for (const parsedItem of section.items) {
        const key = parsedItem.name.trim().toLowerCase()
        const match = matches.get(key)!
        if (match) {
          // Reuse the row as-is (its category/notes/price win over the pasted line's); an
          // already-handled repeat within the paste is a no-op.
          if (match.deleted) {
            await restoreItemRow(list, match.item, { sortOrder: sortOrder++ })
          } else if (match.item.checked) {
            match.item.checked = false
            match.item.checkedAt = null
            match.item.version += 1
            await match.item.save()
            await broadcastSync({
              listId: list.id,
              entityType: 'item',
              entityId: match.item.id,
              op: 'update',
              version: match.item.version,
            })
          }
          if (!items.includes(match.item)) items.push(match.item)
          matches.set(key, { item: match.item, deleted: false })
          continue
        }

        const categoryId = sectionCategoryId ?? (await suggestCategoryId(list, parsedItem.name))
        const created = await Item.create({
          listId: list.id,
          name: parsedItem.name,
          quantity: null,
          notes: parsedItem.notes.length > 0 ? parsedItem.notes.join('\n').slice(0, 1000) : null,
          categoryId,
          price: parsedItem.price,
          checked: false,
          sortOrder: sortOrder++,
          createdBy: user.id,
          version: 1,
        })
        items.push(created)
        matches.set(key, { item: created, deleted: false })
        // Only a section header's category is an explicit assignment worth
        // teaching — items auto-categorized without a header are not.
        if (sectionCategoryId !== null) {
          await learnCategory(list, parsedItem.name, sectionCategoryId)
        }
      }
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: list.id,
      op: 'create',
      payload: { count: items.length },
    })

    logger.debug({ listId: list.id, itemCount: items.length }, 'item bulk import completed')

    return serialize(ItemTransformer.transform(items))
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateItemValidator)
    const { checked, expectedVersion, recurrence, ...rest } = payload

    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(await withRecurrence(item)))),
        conflict: true,
      })
    }

    // Unchecking a previously-checked item is gated by the same open-item limit as
    // every intake path (2026-09-03 revision, from manual testing): it turns an
    // invisible (checked) row back into an open one, so it's blocked the same way
    // when the list has no room — check something off or remove an item first.
    // Unchecking a completed *repeating* item is an undo of its check-off: the copy that
    // completing it spawned is discarded (below), so the series never holds two open items. That
    // discard also frees the slot the reopened row takes, so it bypasses the limit gate.
    let discarded: Item | null = null
    if (checked === false && item.checked && item.recurrenceId) {
      const successor = await openSuccessorOf(item)
      if (successor === 'blocked') {
        return response.unprocessableEntity({
          message:
            'This repeat already has an open occurrence, so this one can’t be reopened. Uncheck the most recent completed occurrence instead.',
        })
      }
      discarded = successor
    }

    if (checked === false && item.checked && !discarded && !(await hasCapacityFor(list))) {
      return response.badRequest({
        message: limitReachedMessageForUncheck(list),
        code: UNCHECKED_LIMIT_REACHED,
      })
    }

    // Sub-tasks (PLAN_29_PHASE_SUBTASKS.md): a parent item can't be checked off
    // while it still has open sub-tasks — same shape as the open-item limit
    // above, a dedicated code the frontend routes to its own toast.
    if (checked === true && !item.checked && list.useSubtasks) {
      const openCount = await countOpenSubtasks(item.id)
      if (openCount > 0) {
        return response.badRequest({
          message: subtasksIncompleteMessage(openCount),
          code: SUBTASKS_INCOMPLETE,
        })
      }
    }

    const previousCategoryId = item.categoryId
    const previousDeadline = item.deadline
    const wasChecked = item.checked
    item.merge(rest)
    if (checked !== undefined) {
      item.checked = checked
      item.checkedAt = checked ? DateTime.now() : null
    }

    // Repeat rule (PLAN_30_PHASE_RECURRING_ITEMS.md): a rule needs a deadline to repeat from, and
    // clearing the deadline stops the repeat. `null` stops repeating (this item only — older
    // checked siblings keep the series as history).
    let recurrenceRule = null
    if (recurrence) {
      // A rule edit flows into the shared series row, which the *open* item spawns from — so it
      // can only be made through the open item, never a checked history row of the same series.
      if (item.checked) {
        return response.unprocessableEntity({
          message: 'A repeat rule can only be changed on an open item.',
        })
      }
      const parsed = ruleFromPayload(recurrence)
      if ('problem' in parsed) return response.unprocessableEntity({ message: parsed.problem })
      if (!item.deadline) {
        return response.unprocessableEntity({ message: 'A repeating item needs a deadline.' })
      }
      recurrenceRule = parsed.rule
    }
    if (recurrence === null || !item.deadline) item.recurrenceId = null

    item.version += 1

    // A rule edit and/or completing a repeating item commit together with the checked row, and
    // everything the spawn decision reads (the "already completed" state, the series counter) is
    // read inside the transaction: SQLite serializes writers on one connection, so a concurrent
    // check-off that committed first is seen here and cannot spawn a second copy.
    const completing = checked === true && !wasChecked
    let spawned: Item | null = null
    if (recurrenceRule || (completing && item.recurrenceId) || discarded) {
      const sortOrder = completing ? await nextSortOrder(list, { respectInsertPosition: true }) : 0
      const today = todayLocalIso(DateTime.now())
      spawned = await db.transaction(async (trx) => {
        const alreadyCompleted =
          completing &&
          (await Item.query({ client: trx })
            .where('id', item.id)
            .where('checked', true)
            .first()) !== null
        if (recurrenceRule) await upsertRecurrence(item, recurrenceRule, trx)
        if (discarded) {
          // Soft-deleted like `destroy`, and detached from the series so restoring or re-adding
          // it later can't bring back a second open item that repeats.
          discarded.deletedAt = DateTime.now()
          discarded.recurrenceId = null
          discarded.version += 1
          await discarded.useTransaction(trx).save()
          await ItemRecurrence.query({ client: trx })
            .where('id', item.recurrenceId as number)
            .decrement('occurrences_created', 1)
        }
        await item.useTransaction(trx).save()
        if (!completing || alreadyCompleted) return null
        // A namesake that detached from the series (its own repeat was stopped) is invisible to
        // `recurrenceId`-based checks, so this re-checks right before spawning — the uncheck-time
        // guard above only covers the reopen step, not a later recheck of the same row.
        if (await hasOpenNamesake(item, trx)) return null
        const nextDate = await nextDueDate(item, today, trx)
        return nextDate ? spawnNextItem(item, nextDate, sortOrder, trx) : null
      })
    } else {
      await item.save()
    }

    // A changed deadline can re-fire a notification that already sent for the
    // old one — see PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md.
    if (item.deadline !== previousDeadline) {
      await DeadlineNotificationSend.query().where('itemId', item.id).delete()
    }

    // Covers the dropdown and drag-to-category paths: re-assigning an item to
    // a *different* non-null category is an explicit choice, so it teaches the
    // model. Setting the same category again (or clearing to null) does not.
    if (typeof payload.categoryId === 'number' && payload.categoryId !== previousCategoryId) {
      await learnCategory(list, item.name, payload.categoryId)
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

    logger.debug({ listId: list.id, itemId: item.id, version: item.version }, 'item updated')

    return serialize(ItemTransformer.transform(await withRecurrence(item)))
  }

  /** Repositions a single item within the list — one item, one neighbor reference, one row
   * touched (see computeMidpointSortOrder above). Mirrors the drag-and-drop UI's
   * `handleItemDrop`, and matches Home Assistant's `todo.move_item` service (`item` +
   * `previous_uid`) closely enough to back it directly, unlike the folders/lists/categories
   * `reorder` endpoints, which take a full `order: number[]` and renumber every row — a shape
   * that doesn't fit items' fractional-indexing design. */
  async move({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const { previousItemId, expectedVersion } = await request.validateUsing(moveItemValidator)

    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(await withRecurrence(item)))),
        conflict: true,
      })
    }

    const siblings = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .whereNot('id', item.id)
      .orderBy('sortOrder', 'asc')

    let precedingIndex = -1
    if (previousItemId !== undefined && previousItemId !== null) {
      precedingIndex = siblings.findIndex((sibling) => sibling.id === previousItemId)
      if (precedingIndex === -1) {
        return response.badRequest({
          message: 'previousItemId must reference a different active item in this list',
        })
      }
    }

    item.sortOrder = computeMidpointSortOrder(
      siblings[precedingIndex]?.sortOrder,
      siblings[precedingIndex + 1]?.sortOrder
    )
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'update',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id, sortOrder: item.sortOrder }, 'item moved')

    return serialize(ItemTransformer.transform(await withRecurrence(item)))
  }

  /** Moves an item to a different list. Categories and stores are list-scoped (each list owns
   * its own category rows, and `list_stores` is a per-list many-to-many), so unlike `update`'s
   * `categoryId`/`storeId` merge, both are always re-resolved against the destination rather than
   * carried over from the source — the old ids are meaningless in a different list's rows. */
  async moveToList({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const { destinationListId, expectedVersion } =
      await request.validateUsing(moveItemToListValidator)

    if (destinationListId === list.id) {
      return response.badRequest({ message: 'Item is already in this list' })
    }

    // Requiring 'editor' here is what enforces "owner or editor permission to write to a list"
    // on the destination — same bar as every other item mutation, just checked against the
    // second list instead of (or in addition to) the source one above.
    const destination = await ListPolicy.requireList(user, destinationListId, 'editor')

    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(await withRecurrence(item)))),
        conflict: true,
      })
    }

    const categoryId = await suggestCategoryId(destination, item.name)
    let storeId: number | null = null
    if (item.storeId !== null) {
      const attached = await destination
        .related('stores')
        .query()
        .where('stores.id', item.storeId)
        .first()
      storeId = attached ? item.storeId : null
    }

    // Moving an unchecked item in is intake on the destination list; moving a
    // checked one isn't (it arrives checked).
    if (!item.checked && !(await hasCapacityFor(destination))) {
      return response.badRequest({
        message: limitReachedMessage(destination),
        code: UNCHECKED_LIMIT_REACHED,
      })
    }

    const sourceListId = list.id
    item.listId = destination.id
    item.categoryId = categoryId
    item.storeId = storeId
    item.sortOrder = await nextSortOrder(destination)
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: sourceListId,
      entityType: 'item',
      entityId: item.id,
      op: 'delete',
    })
    await broadcastSync({
      listId: destination.id,
      entityType: 'item',
      entityId: item.id,
      op: 'create',
      version: item.version,
    })

    logger.debug(
      { sourceListId, destinationListId: destination.id, itemId: item.id },
      'item moved to another list'
    )

    return serialize(ItemTransformer.transform(await withRecurrence(item)))
  }

  async destroy({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(await withRecurrence(item)))),
        conflict: true,
      })
    }

    item.deletedAt = DateTime.now()
    // A deleted row is reused later (re-add, Alexa, restore) as a fresh open item, so don't leave
    // it looking checked off.
    item.checked = false
    item.checkedAt = null
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'delete',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id }, 'item deleted')

    return response.noContent()
  }

  async restore({ auth, params, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    // Restoring makes the row unchecked again — intake, so gated like every
    // other path that brings an item back onto a full list.
    if (!(await hasCapacityFor(list))) {
      return response.badRequest({
        message: limitReachedMessage(list),
        code: UNCHECKED_LIMIT_REACHED,
      })
    }

    await restoreItemRow(list, item)

    logger.debug({ listId: list.id, itemId: item.id }, 'item restored')

    return serialize(ItemTransformer.transform(await withRecurrence(item)))
  }

  /** Hard-deletes an already-soft-deleted row — the "Recently Deleted" page's permanent-delete
   * action, for a test item or typo that shouldn't be kept around waiting to be restored. Only
   * reachable for a row that's already soft-deleted, so an active item can't be purged without
   * going through `destroy` first. */
  async purge({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    const itemId = item.id
    await item.delete()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: itemId,
      op: 'purge',
    })

    logger.debug({ listId: list.id, itemId }, 'item purged')

    return response.noContent()
  }
}
