import List from '#models/list'
import Store from '#models/store'
import ListStore from '#models/list_store'
import StoreCategoryOrder from '#models/store_category_order'
import Category from '#models/category'
import {
  attachStoreValidator,
  updateStoreValidator,
  reorderStoreCategoriesValidator,
} from '#validators/store'
import type { HttpContext } from '@adonisjs/core/http'
import StoreTransformer from '#transformers/store_transformer'
import StoreCategoryOrderTransformer from '#transformers/store_category_order_transformer'

async function findOwnedList(userId: number, listId: string | number) {
  return List.query()
    .where('id', listId)
    .where('ownerId', userId)
    .whereNull('deletedAt')
    .firstOrFail()
}

/**
 * A store is visible to a user if it's attached to at least one list they
 * own. Real membership-based sharing lands in Phase 3 (ListMember); this is
 * the owner-only stand-in until then — see PLAN.md §7.
 */
async function findAccessibleStore(userId: number, storeId: string | number) {
  return Store.query()
    .where('id', storeId)
    .whereHas('lists', (query) => query.where('ownerId', userId))
    .firstOrFail()
}

export default class StoresController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    await list.load('stores')

    return serialize(StoreTransformer.transform(list.stores))
  }

  /**
   * Attaches an existing store (by id) to this list, or creates a new
   * store and attaches it in one call — see PLAN.md §8.
   */
  async store({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const payload = await request.validateUsing(attachStoreValidator)

    let store: Store
    if (payload.storeId) {
      store = await findAccessibleStore(user.id, payload.storeId)
    } else if (payload.name) {
      store = await Store.create({
        name: payload.name,
        color: payload.color ?? '#3b82f6',
        createdBy: user.id,
      })
    } else {
      return response.badRequest({ message: 'Either storeId or name is required' })
    }

    await ListStore.firstOrCreate({ listId: list.id, storeId: store.id })

    return serialize(StoreTransformer.transform(store))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await findAccessibleStore(user.id, params.id)
    const payload = await request.validateUsing(updateStoreValidator)
    store.merge(payload)
    await store.save()

    return serialize(StoreTransformer.transform(store))
  }

  async detach({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    await ListStore.query().where('listId', list.id).where('storeId', params.storeId).delete()

    return response.noContent()
  }

  async categories({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await findAccessibleStore(user.id, params.id)
    const orders = await StoreCategoryOrder.query()
      .where('storeId', store.id)
      .orderBy('sortOrder', 'asc')

    return serialize(StoreCategoryOrderTransformer.transform(orders))
  }

  async reorderCategories({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const store = await findAccessibleStore(user.id, params.id)
    const { categories } = await request.validateUsing(reorderStoreCategoriesValidator)

    const categoryIds = categories.map((entry) => entry.categoryId)
    const matchingCategories = await Category.query().whereIn('id', categoryIds)
    const validCategoryIds = new Set(matchingCategories.map((category) => category.id))

    for (const entry of categories) {
      if (!validCategoryIds.has(entry.categoryId)) continue
      await StoreCategoryOrder.updateOrCreate(
        { storeId: store.id, categoryId: entry.categoryId },
        { sortOrder: entry.sortOrder }
      )
    }

    const orders = await StoreCategoryOrder.query()
      .where('storeId', store.id)
      .orderBy('sortOrder', 'asc')

    return serialize(StoreCategoryOrderTransformer.transform(orders))
  }
}
