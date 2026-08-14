import FavoriteItem from '#models/favorite_item'
import Item from '#models/item'
import ListPolicy from '#policies/list_policy'
import { createFavoriteItemValidator, updateFavoriteItemValidator } from '#validators/favorite_item'
import type { HttpContext } from '@adonisjs/core/http'
import FavoriteItemTransformer from '#transformers/favorite_item_transformer'
import ItemTransformer from '#transformers/item_transformer'
import { broadcastSync } from '#services/sync_broadcaster'
import { hasVersionConflict, parseExpectedVersion } from '#services/version_conflict'
import { DateTime } from 'luxon'

export default class FavoriteItemsController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'viewer')
    const favorites = await FavoriteItem.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .orderBy('name', 'asc')

    return serialize(FavoriteItemTransformer.transform(favorites))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const payload = await request.validateUsing(createFavoriteItemValidator)

    const favorite = await FavoriteItem.create({
      userId: user.id,
      listId: list.id,
      name: payload.name,
      defaultCategoryId: payload.defaultCategoryId ?? null,
      defaultQuantity: payload.defaultQuantity ?? null,
      version: 1,
    })

    await broadcastSync({
      listId: list.id,
      entityType: 'favorite_item',
      entityId: favorite.id,
      op: 'create',
      version: favorite.version,
    })

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async update({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateFavoriteItemValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(favorite, expectedVersion)) {
      return response.status(409).send({
        ...(await serialize(FavoriteItemTransformer.transform(favorite))),
        conflict: true,
      })
    }

    favorite.merge(rest)
    favorite.version += 1
    await favorite.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'favorite_item',
      entityId: favorite.id,
      op: 'update',
      version: favorite.version,
    })

    return serialize(FavoriteItemTransformer.transform(favorite))
  }

  async destroy({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(favorite, expectedVersion)) {
      return response.status(409).send({
        ...(await serialize(FavoriteItemTransformer.transform(favorite))),
        conflict: true,
      })
    }

    favorite.deletedAt = DateTime.now()
    favorite.version += 1
    await favorite.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'favorite_item',
      entityId: favorite.id,
      op: 'delete',
      version: favorite.version,
    })

    return response.noContent()
  }

  /**
   * One-tap rebuild: adds this favorite back to its list as a new item,
   * seeded with its default category/quantity — the "master list" loop
   * from PLAN.md §3, now scoped to a single list.
   */
  async addToList({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const favorite = await FavoriteItem.query()
      .where('id', params.id)
      .where('listId', list.id)
      .whereNull('deletedAt')
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
      version: 1,
    })

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'create',
      version: item.version,
    })

    return serialize(ItemTransformer.transform(item))
  }
}
