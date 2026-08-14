import FavoriteItem from '#models/favorite_item'
import List from '#models/list'
import Item from '#models/item'
import { createFavoriteItemValidator, updateFavoriteItemValidator } from '#validators/favorite_item'
import type { HttpContext } from '@adonisjs/core/http'
import FavoriteItemTransformer from '#transformers/favorite_item_transformer'
import ItemTransformer from '#transformers/item_transformer'

async function findOwnedList(userId: number, listId: string | number) {
  return List.query()
    .where('id', listId)
    .where('ownerId', userId)
    .whereNull('deletedAt')
    .firstOrFail()
}

export default class FavoriteItemsController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const favorites = await FavoriteItem.query().where('listId', list.id).orderBy('name', 'asc')

    return serialize(FavoriteItemTransformer.transform(favorites))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const payload = await request.validateUsing(createFavoriteItemValidator)

    const favorite = await FavoriteItem.create({
      userId: user.id,
      listId: list.id,
      name: payload.name,
      defaultCategoryId: payload.defaultCategoryId ?? null,
      defaultQuantity: payload.defaultQuantity ?? null,
    })

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .firstOrFail()

    const payload = await request.validateUsing(updateFavoriteItemValidator)
    favorite.merge(payload)
    await favorite.save()

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .firstOrFail()

    await favorite.delete()
    return response.noContent()
  }

  /**
   * One-tap rebuild: adds this favorite back to its list as a new item,
   * seeded with its default category/quantity — the "master list" loop
   * from PLAN.md §3, now scoped to a single list.
   */
  async addToList({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .firstOrFail()

    const maxSortOrder = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .max('sort_order as maxSortOrder')
      .first()

    const item = await Item.create({
      listId: list.id,
      name: favorite.name,
      quantity: favorite.defaultQuantity,
      notes: null,
      categoryId: favorite.defaultCategoryId,
      checked: false,
      sortOrder: Number(maxSortOrder?.$extras.maxSortOrder ?? -1) + 1,
      createdBy: user.id,
    })

    return serialize(ItemTransformer.transform(item))
  }
}
