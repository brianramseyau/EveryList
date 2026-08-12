import FavoriteItem from '#models/favorite_item'
import List from '#models/list'
import Item from '#models/item'
import { createFavoriteItemValidator, updateFavoriteItemValidator } from '#validators/favorite_item'
import type { HttpContext } from '@adonisjs/core/http'
import FavoriteItemTransformer from '#transformers/favorite_item_transformer'
import ItemTransformer from '#transformers/item_transformer'

export default class FavoriteItemsController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const favorites = await FavoriteItem.query().where('userId', user.id).orderBy('name', 'asc')

    return serialize(FavoriteItemTransformer.transform(favorites))
  }

  async store({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createFavoriteItemValidator)

    const favorite = await FavoriteItem.create({
      userId: user.id,
      name: payload.name,
      defaultCategoryId: payload.defaultCategoryId ?? null,
      defaultQuantity: payload.defaultQuantity ?? null,
    })

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    const payload = await request.validateUsing(updateFavoriteItemValidator)
    favorite.merge(payload)
    await favorite.save()

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    await favorite.delete()
    return response.noContent()
  }

  /**
   * One-tap rebuild: adds this favorite to a list as a new item, seeded
   * with its default category/quantity — the "master list" loop from
   * PLAN.md §3.
   */
  async addToList({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()
    const list = await List.query()
      .where('id', params.listId)
      .where('ownerId', user.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const maxSortOrder = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .max('sortOrder as maxSortOrder')
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
