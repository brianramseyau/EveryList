import Item from '#models/item'
import SubItem from '#models/sub_item'
import ListPolicy from '#policies/list_policy'
import {
  createSubItemValidator,
  updateSubItemValidator,
  moveSubItemValidator,
} from '#validators/sub_item'
import type { HttpContext } from '@adonisjs/core/http'
import SubItemTransformer from '#transformers/sub_item_transformer'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { areAllSubtasksChecked } from '#services/subtask_completion'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'
import { computeMidpointSortOrder } from '#controllers/items_controller'

/** Loads the parent item, scoped to the requesting list and not soft-deleted —
 * every sub-item route hangs off one of these. */
async function requireItem(listId: number | string, itemId: number | string): Promise<Item> {
  return Item.query()
    .where('id', itemId)
    .where('listId', listId)
    .whereNull('deletedAt')
    .firstOrFail()
}

async function nextSubItemSortOrder(itemId: number): Promise<number> {
  const result = await SubItem.query()
    .where('itemId', itemId)
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

/** Server-side half of the auto-complete gate (PLAN_29_PHASE_SUBTASKS.md): when the
 * sub-task just saved leaves every sibling checked and the list opted in, also check
 * the parent item in the same request — authoritative here, not a client-only nicety,
 * so it flows through the same sync/offline-queue path as every other mutation. */
async function maybeAutoCompleteParent(item: Item, useSubtaskAutoComplete: boolean): Promise<void> {
  if (!useSubtaskAutoComplete || item.checked) return
  if (!(await areAllSubtasksChecked(item.id))) return

  item.checked = true
  item.checkedAt = DateTime.now()
  item.version += 1
  await item.save()

  await broadcastSync({
    listId: item.listId,
    entityType: 'item',
    entityId: item.id,
    op: 'update',
    version: item.version,
  })
}

export default class SubItemsController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    const item = await requireItem(list.id, params.itemId)

    const subItems = await SubItem.query().where('itemId', item.id).orderBy('sortOrder', 'asc')
    return serialize(SubItemTransformer.transform(subItems))
  }

  async store({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await requireItem(list.id, params.itemId)
    const payload = await request.validateUsing(createSubItemValidator)

    const subItem = await SubItem.create({
      itemId: item.id,
      name: payload.name,
      checked: false,
      sortOrder: await nextSubItemSortOrder(item.id),
      createdBy: user.id,
      version: 1,
    })

    await broadcastSync({
      listId: list.id,
      entityType: 'sub_item',
      entityId: subItem.id,
      op: 'create',
      version: subItem.version,
      payload: { itemId: item.id },
    })

    logger.debug({ listId: list.id, itemId: item.id, subItemId: subItem.id }, 'sub-item created')

    return serialize(SubItemTransformer.transform(subItem))
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await requireItem(list.id, params.itemId)
    const subItem = await SubItem.query()
      .where('id', params.subtaskId)
      .where('itemId', item.id)
      .firstOrFail()

    const payload = await request.validateUsing(updateSubItemValidator)
    const { checked, expectedVersion, ...rest } = payload

    if (hasVersionConflict(subItem, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'sub_item',
        id: subItem.id,
        expectedVersion,
        actualVersion: subItem.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(SubItemTransformer.transform(subItem))),
        conflict: true,
      })
    }

    subItem.merge(rest)
    if (checked !== undefined) {
      subItem.checked = checked
      subItem.checkedAt = checked ? DateTime.now() : null
    }
    subItem.version += 1
    await subItem.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'sub_item',
      entityId: subItem.id,
      op: 'update',
      version: subItem.version,
      payload: { itemId: item.id },
    })

    if (checked === true) {
      await maybeAutoCompleteParent(item, list.useSubtaskAutoComplete)
    }

    logger.debug(
      { listId: list.id, itemId: item.id, subItemId: subItem.id, version: subItem.version },
      'sub-item updated'
    )

    return serialize(SubItemTransformer.transform(subItem))
  }

  /** Repositions a sub-item within its parent's checklist — same fractional-indexing
   * approach as ItemsController#move, just scoped by `itemId` instead of `listId`. */
  async move({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await requireItem(list.id, params.itemId)
    const subItem = await SubItem.query()
      .where('id', params.subtaskId)
      .where('itemId', item.id)
      .firstOrFail()

    const { previousSubItemId, expectedVersion } = await request.validateUsing(moveSubItemValidator)

    if (hasVersionConflict(subItem, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'sub_item',
        id: subItem.id,
        expectedVersion,
        actualVersion: subItem.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(SubItemTransformer.transform(subItem))),
        conflict: true,
      })
    }

    const siblings = await SubItem.query()
      .where('itemId', item.id)
      .whereNot('id', subItem.id)
      .orderBy('sortOrder', 'asc')

    let precedingIndex = -1
    if (previousSubItemId !== undefined && previousSubItemId !== null) {
      precedingIndex = siblings.findIndex((sibling) => sibling.id === previousSubItemId)
      if (precedingIndex === -1) {
        return response.badRequest({
          message: 'previousSubItemId must reference a different sub-task on this item',
        })
      }
    }

    subItem.sortOrder = computeMidpointSortOrder(
      siblings[precedingIndex]?.sortOrder,
      siblings[precedingIndex + 1]?.sortOrder
    )
    subItem.version += 1
    await subItem.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'sub_item',
      entityId: subItem.id,
      op: 'update',
      version: subItem.version,
      payload: { itemId: item.id },
    })

    logger.debug(
      { listId: list.id, itemId: item.id, subItemId: subItem.id, sortOrder: subItem.sortOrder },
      'sub-item moved'
    )

    return serialize(SubItemTransformer.transform(subItem))
  }

  async destroy({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await requireItem(list.id, params.itemId)
    const subItem = await SubItem.query()
      .where('id', params.subtaskId)
      .where('itemId', item.id)
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(subItem, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'sub_item',
        id: subItem.id,
        expectedVersion,
        actualVersion: subItem.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(SubItemTransformer.transform(subItem))),
        conflict: true,
      })
    }

    // Hard delete — sub-tasks have no restore/recently-deleted UI (see
    // foundational/PLAN_29_PHASE_SUBTASKS.md), unlike top-level items.
    const subItemId = subItem.id
    await subItem.delete()

    await broadcastSync({
      listId: list.id,
      entityType: 'sub_item',
      entityId: subItemId,
      op: 'delete',
      payload: { itemId: item.id },
    })

    logger.debug({ listId: list.id, itemId: item.id, subItemId }, 'sub-item deleted')

    return response.noContent()
  }
}
