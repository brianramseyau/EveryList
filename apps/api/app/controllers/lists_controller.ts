import List from '#models/list'
import Item from '#models/item'
import Folder from '#models/folder'
import ListMember from '#models/list_member'
import CategoryLearning from '#models/category_learning'
import ListPolicy from '#policies/list_policy'
import { createListValidator, updateListValidator, reorderListsValidator } from '#validators/list'
import type { HttpContext } from '@adonisjs/core/http'
import ListTransformer from '#transformers/list_transformer'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import { createOwnedList } from '#services/list_creation'
import { getEffectiveCategories } from '#services/category_service'
import { buildFlatDisplayOrder } from '#services/list_display_order'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'

/** Lists visible to `userId`, ordered by that user's own `list_members.sort_order`
 * (a per-user view preference — see PLAN_12_PHASE_LISTS_REORDER_ACCOUNT_IDENTITY.md §A) rather than `createdAt`. */
async function loadListsForUser(userId: number) {
  const lists = await List.query()
    .whereHas('members', (query) => query.where('userId', userId).whereNotNull('acceptedAt'))
    .whereNull('deletedAt')
    .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
    .withCount('members', (query) => query.whereNotNull('acceptedAt'))
    .preload('members', (query) => query.where('userId', userId))
    .preload('owner')

  // `members` is always the single row `whereHas` just matched — the `?? 0`
  // fallback exists only to satisfy the optional-chained type, not a reachable case.
  /* v8 ignore next */
  lists.sort((a, b) => (a.members[0]?.sortOrder ?? 0) - (b.members[0]?.sortOrder ?? 0))

  return lists
}

async function findDuplicateNamedList(ownerId: number, name: string, excludeId?: number) {
  const query = List.query()
    .where('ownerId', ownerId)
    .whereNull('deletedAt')
    .whereRaw('LOWER(TRIM(name)) = ?', [name.trim().toLowerCase()])

  if (excludeId !== undefined) {
    query.whereNot('id', excludeId)
  }

  return query.first()
}

export default class ListsController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const lists = await loadListsForUser(user.id)

    return serialize(ListTransformer.transform(lists))
  }

  /** Reorders the requesting user's own view of their lists — a per-user
   * preference stored on `list_members`, not shared list state, so it never
   * touches other members' rows or broadcasts a sync event. */
  async reorder({ auth, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const { order } = await request.validateUsing(reorderListsValidator)

    logger.debug({ userId: user.id, count: order.length }, 'reordering lists')

    const memberships = await ListMember.query()
      .whereIn('listId', order)
      .where('userId', user.id)
      .whereNotNull('acceptedAt')

    const membershipsByListId = new Map(
      memberships.map((membership) => [membership.listId, membership])
    )

    for (const [index, listId] of order.entries()) {
      const membership = membershipsByListId.get(listId)
      if (!membership) continue

      membership.sortOrder = index
      await membership.save()
    }

    return serialize(ListTransformer.transform(await loadListsForUser(user.id)))
  }

  async store({ auth, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createListValidator)

    if (await findDuplicateNamedList(user.id, payload.name)) {
      return response.unprocessableEntity({
        errors: [{ field: 'name', message: 'You already have a list with this name.' }],
      })
    }

    const list = await createOwnedList({
      ownerId: user.id,
      name: payload.name,
      color: payload.color ?? '#3b82f6',
      icon: payload.icon ?? null,
      useCategories: payload.useCategories,
      useCategoryLearning: payload.useCategoryLearning,
      useShops: payload.useShops,
      useFavorites: payload.useFavorites,
      useRecent: payload.useRecent,
      useQuantity: payload.useQuantity,
      usePrice: payload.usePrice,
      useDeadline: payload.useDeadline,
      showStoreInList: payload.showStoreInList,
      showPriceInList: payload.showPriceInList,
      itemSortOrder: payload.itemSortOrder,
      insertPosition: payload.insertPosition,
      maxUncheckedItems: payload.maxUncheckedItems,
    })

    logger.debug({ userId: user.id, listId: list.id }, 'list created')

    return serialize(ListTransformer.transform(list))
  }

  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user, params.id, 'viewer')
    const list = await List.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .withCount('members', (query) => query.whereNotNull('acceptedAt'))
      .preload('members', (query) => query.where('userId', user.id))
      .preload('owner')
      .firstOrFail()

    return serialize(ListTransformer.transform(list))
  }

  /**
   * A single pre-ordered, flattened snapshot of a list's active items — for callers that render a
   * flat display with no room to group by category themselves (the Android home-screen widget)
   * and would otherwise need to fetch items + categories separately and reproduce the app's own
   * `groups` ordering client-side. Uses `buildFlatDisplayOrder`, the same category-clustered,
   * ranked-or-alphabetical order the app's list view and the Alexa display use — dropping
   * `sortOrder`/`categoryId` from the response since a caller that only renders a flat list has no
   * use for them once the server has already ordered things.
   */
  async widgetSnapshot({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.id, 'viewer')
    const includeChecked = request.input('includeChecked', 'true') !== 'false'

    const [items, categories] = await Promise.all([
      Item.query().where('listId', list.id).whereNull('deletedAt'),
      getEffectiveCategories(list),
    ])
    const ordered = buildFlatDisplayOrder(list, items, categories, { includeChecked })

    return serialize({
      listName: list.name,
      items: ordered.map((item) => ({
        id: item.id,
        name: item.name,
        checked: item.checked,
        quantity: item.quantity,
        price: item.price,
      })),
    })
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user, params.id, 'owner')
    const list = await List.query()
      .where('id', params.id)
      .whereNull('deletedAt')
      .withCount('items', (query) => query.whereNull('deletedAt').where('checked', false))
      .firstOrFail()

    const payload = await request.validateUsing(updateListValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(list, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'list',
        id: list.id,
        expectedVersion,
        actualVersion: list.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ListTransformer.transform(list))),
        conflict: true,
      })
    }

    if (rest.folderId !== null && rest.folderId !== undefined) {
      await Folder.query().where('id', rest.folderId).where('userId', user.id).firstOrFail()
    }

    if (rest.name !== undefined && (await findDuplicateNamedList(user.id, rest.name, list.id))) {
      return response.unprocessableEntity({
        errors: [{ field: 'name', message: 'You already have a list with this name.' }],
      })
    }

    list.merge(rest)
    list.version += 1
    await list.save()

    // Turning learning off forgets everything the list's model had learned —
    // the learned rows are pure derived data (token → category counts), and
    // keeping them would be exactly the dead-weight bloat the toggle exists
    // to stop. Re-enabling starts from an empty model and re-teaches through
    // normal explicit assignments.
    if (rest.useCategoryLearning === false) {
      const deleted = await CategoryLearning.query().where('listId', list.id).delete()
      logger.debug(
        { listId: list.id, rowsDeleted: deleted },
        'category learning disabled, purged learned rows'
      )
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'list',
      entityId: list.id,
      op: 'update',
      version: list.version,
    })

    logger.debug({ listId: list.id, version: list.version }, 'list updated')

    return serialize(ListTransformer.transform(list))
  }

  async destroy({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    await ListPolicy.requireList(user, params.id, 'owner')
    const list = await List.query().where('id', params.id).whereNull('deletedAt').firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(list, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'list',
        id: list.id,
        expectedVersion,
        actualVersion: list.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ListTransformer.transform(list))),
        conflict: true,
      })
    }

    list.deletedAt = DateTime.now()
    list.version += 1
    await list.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'list',
      entityId: list.id,
      op: 'delete',
      version: list.version,
    })

    logger.debug({ listId: list.id }, 'list deleted')

    return response.noContent()
  }
}
