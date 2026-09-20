import Store from '#models/store'
import ListStore from '#models/list_store'
import StoreCategoryOrder from '#models/store_category_order'
import Category from '#models/category'
import Item from '#models/item'
import FavoriteItem from '#models/favorite_item'
import ListPolicy from '#policies/list_policy'
import {
  attachStoreValidator,
  updateStoreValidator,
  reorderStoreCategoriesValidator,
} from '#validators/store'
import type { HttpContext } from '@adonisjs/core/http'
import StoreTransformer from '#transformers/store_transformer'
import StoreCategoryOrderTransformer from '#transformers/store_category_order_transformer'
import { broadcastSync, broadcastToStoreLists } from '#services/sync_broadcaster'
import { hasVersionConflict, reportVersionConflict } from '#services/version_conflict'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export default class StoresController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    await list.load('stores', (query) => query.whereNull('deletedAt'))

    return serialize(StoreTransformer.transform(list.stores))
  }

  /**
   * Attaches an existing store (by id) to this list, or creates a new
   * store and attaches it in one call — see PLAN_00_FOUNDATIONAL_PLAN.md §8.
   */
  async store({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const payload = await request.validateUsing(attachStoreValidator)

    let store: Store
    if (payload.storeId) {
      store = await ListPolicy.requireStoreRole(user, payload.storeId, 'viewer')
    } else if (payload.name) {
      store = await Store.create({
        name: payload.name,
        color: payload.color ?? '#3b82f6',
        createdBy: user.id,
        version: 1,
      })
    } else {
      return response.badRequest({ message: 'Either storeId or name is required' })
    }

    await ListStore.firstOrCreate({ listId: list.id, storeId: store.id })
    await broadcastSync({
      listId: list.id,
      entityType: 'store',
      entityId: store.id,
      op: 'create',
      version: store.version,
    })

    logger.debug({ listId: list.id, storeId: store.id }, 'store attached to list')

    return serialize(StoreTransformer.transform(store))
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await ListPolicy.requireStoreRole(user, params.id, 'editor')
    const payload = await request.validateUsing(updateStoreValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(store, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'store',
        id: store.id,
        expectedVersion,
        actualVersion: store.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(StoreTransformer.transform(store))),
        conflict: true,
      })
    }

    store.merge(rest)
    store.version += 1
    await store.save()

    await broadcastToStoreLists(store, {
      entityType: 'store',
      entityId: store.id,
      op: 'update',
      version: store.version,
    })

    logger.debug({ storeId: store.id, version: store.version }, 'store updated')

    return serialize(StoreTransformer.transform(store))
  }

  /**
   * Detaches a store from this list. `storeId` is only meaningful within the
   * lists a store is attached to (list_stores is per-list), so once detached
   * it's no longer a valid reference for this list's items or favorites —
   * orphan them (null out storeId) rather than leaving a stale id that would
   * silently exclude them from every store-filtered view going forward (and,
   * for a favorite, get copied onto every future item created from it — see
   * FavoriteItemsController#addToList). Runs against every item regardless of
   * deletedAt, so a later restore from Recently Deleted doesn't resurrect the
   * same stale reference. The pivot delete and both orphan loops share one
   * transaction so a mid-loop failure can't leave the pivot gone but some
   * items/favorites still pointing at it; the broadcasts are batched (one per
   * affected entity type, not one per row) and sent after commit, since
   * per-row broadcasts would (a) risk running against a second, untransacted
   * connection while this transaction still holds SQLite's single writer
   * lock, and (b) fire a `loadAll()` reload per row on every connected
   * client, including the one that made this request.
   */
  async detach({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const storeId = Number(params.storeId)
    if (!Number.isInteger(storeId)) {
      return response.notFound()
    }

    const { orphanedItemCount, orphanedFavoriteCount } = await db.transaction(async (trx) => {
      await ListStore.query({ client: trx })
        .where('listId', list.id)
        .where('storeId', storeId)
        .delete()

      const items = await Item.query({ client: trx })
        .where('listId', list.id)
        .where('storeId', storeId)
      for (const item of items) {
        item.storeId = null
        item.version += 1
        await item.useTransaction(trx).save()
      }

      const favorites = await FavoriteItem.query({ client: trx })
        .where('listId', list.id)
        .where('storeId', storeId)
      for (const favorite of favorites) {
        favorite.storeId = null
        favorite.version += 1
        await favorite.useTransaction(trx).save()
      }

      return { orphanedItemCount: items.length, orphanedFavoriteCount: favorites.length }
    })

    if (orphanedItemCount > 0) {
      await broadcastSync({
        listId: list.id,
        entityType: 'item',
        entityId: list.id,
        op: 'update',
        payload: { storeId, count: orphanedItemCount },
      })
    }
    if (orphanedFavoriteCount > 0) {
      await broadcastSync({
        listId: list.id,
        entityType: 'favorite_item',
        entityId: list.id,
        op: 'update',
        payload: { storeId, count: orphanedFavoriteCount },
      })
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'store',
      entityId: storeId,
      op: 'delete',
    })

    logger.debug(
      { listId: list.id, storeId, orphanedItemCount, orphanedFavoriteCount },
      'store detached from list; its items and favorites orphaned'
    )

    return response.noContent()
  }

  async categories({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await ListPolicy.requireStoreRole(user, params.id, 'viewer')
    const orders = await StoreCategoryOrder.query()
      .where('storeId', store.id)
      .whereNull('deletedAt')
      .orderBy('sortOrder', 'asc')

    return serialize(StoreCategoryOrderTransformer.transform(orders))
  }

  async reorderCategories({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await ListPolicy.requireStoreRole(user, params.id, 'editor')
    const { categories } = await request.validateUsing(reorderStoreCategoriesValidator)

    const categoryIds = categories.map((entry) => entry.categoryId)
    const matchingCategories = await Category.query().whereIn('id', categoryIds)
    const validCategoryIds = new Set(matchingCategories.map((category) => category.id))

    for (const entry of categories) {
      if (!validCategoryIds.has(entry.categoryId)) continue
      const existing = await StoreCategoryOrder.query()
        .where('storeId', store.id)
        .where('categoryId', entry.categoryId)
        .first()

      if (existing) {
        existing.sortOrder = entry.sortOrder
        existing.version += 1
        await existing.save()
      } else {
        await StoreCategoryOrder.create({
          storeId: store.id,
          categoryId: entry.categoryId,
          sortOrder: entry.sortOrder,
          version: 1,
        })
      }
    }

    const orders = await StoreCategoryOrder.query()
      .where('storeId', store.id)
      .whereNull('deletedAt')
      .orderBy('sortOrder', 'asc')

    await broadcastToStoreLists(store, {
      entityType: 'store_category_order',
      entityId: store.id,
      op: 'update',
      payload: { categoryIds: categories.map((entry) => entry.categoryId) },
    })

    logger.debug({ storeId: store.id, count: categories.length }, 'store categories reordered')

    return serialize(StoreCategoryOrderTransformer.transform(orders))
  }

  /**
   * Clears this store's custom aisle order entirely — soft-deletes every
   * `StoreCategoryOrder` row, so categories fall back to their default
   * (list) sort order instead of the store-specific override.
   */
  async resetCategories({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await ListPolicy.requireStoreRole(user, params.id, 'editor')

    const orders = await StoreCategoryOrder.query()
      .where('storeId', store.id)
      .whereNull('deletedAt')

    for (const order of orders) {
      order.deletedAt = DateTime.now()
      order.version += 1
      await order.save()
    }

    await broadcastToStoreLists(store, {
      entityType: 'store_category_order',
      entityId: store.id,
      op: 'delete',
    })

    logger.debug({ storeId: store.id, count: orders.length }, 'store category order reset')

    return response.noContent()
  }
}
