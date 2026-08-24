import Store from '#models/store'
import ListStore from '#models/list_store'
import StoreCategoryOrder from '#models/store_category_order'
import Category from '#models/category'
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

export default class StoresController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    await list.load('stores', (query) => query.whereNull('deletedAt'))

    return serialize(StoreTransformer.transform(list.stores))
  }

  /**
   * Attaches an existing store (by id) to this list, or creates a new
   * store and attaches it in one call — see PLAN.md §8.
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

  async detach({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    await ListStore.query().where('listId', list.id).where('storeId', params.storeId).delete()

    await broadcastSync({
      listId: list.id,
      entityType: 'store',
      entityId: Number(params.storeId),
      op: 'delete',
    })

    logger.debug({ listId: list.id, storeId: Number(params.storeId) }, 'store detached from list')

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
}
