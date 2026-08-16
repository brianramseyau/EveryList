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

    // Re-adding a favorite by the same name previously deletes-then-recreates
    // it at the app level rather than inserting a fresh row: the DB's
    // (list_id, name) unique index still counts soft-deleted rows, and
    // deleted_at is kept (rather than hard-deleting) so offline delete/sync
    // resolves as a versioned update elsewhere in this table too.
    const existing = await FavoriteItem.query()
      .where('listId', list.id)
      .whereRaw('LOWER(TRIM(name)) = ?', [payload.name.trim().toLowerCase()])
      .first()

    if (existing) {
      const wasDeleted = existing.deletedAt !== null
      existing.merge({
        name: payload.name,
        defaultCategoryId: payload.defaultCategoryId ?? null,
        defaultQuantity: payload.defaultQuantity ?? null,
        storeId: payload.storeId ?? null,
        notes: payload.notes ?? null,
        price: payload.price ?? null,
        deletedAt: null,
      })
      existing.version += 1
      await existing.save()

      await broadcastSync({
        listId: list.id,
        entityType: 'favorite_item',
        entityId: existing.id,
        op: wasDeleted ? 'create' : 'update',
        version: existing.version,
      })

      return serialize(FavoriteItemTransformer.transform(existing))
    }

    const favorite = await FavoriteItem.create({
      userId: user.id,
      listId: list.id,
      name: payload.name,
      defaultCategoryId: payload.defaultCategoryId ?? null,
      defaultQuantity: payload.defaultQuantity ?? null,
      storeId: payload.storeId ?? null,
      notes: payload.notes ?? null,
      price: payload.price ?? null,
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

    const existing = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .whereRaw('LOWER(TRIM(name)) = ?', [favorite.name.trim().toLowerCase()])
      .first()

    if (existing) {
      if (existing.checked) {
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
      }

      return serialize(ItemTransformer.transform(existing))
    }

    const maxSortOrder = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .max('sort_order as maxSortOrder')
      .first()

    const item = await Item.create({
      listId: list.id,
      name: favorite.name,
      quantity: favorite.defaultQuantity,
      notes: favorite.notes,
      categoryId: favorite.defaultCategoryId,
      storeId: favorite.storeId,
      price: favorite.price,
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
