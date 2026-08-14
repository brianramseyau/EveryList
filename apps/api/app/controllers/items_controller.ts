import type List from '#models/list'
import Item from '#models/item'
import ListPolicy from '#policies/list_policy'
import { createItemValidator, updateItemValidator, importItemsValidator } from '#validators/item'
import type { HttpContext } from '@adonisjs/core/http'
import ItemTransformer from '#transformers/item_transformer'
import { getEffectiveCategories } from '#services/category_service'
import { suggestCategoryName } from '#services/auto_categorize_service'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'

async function resolveCategoryId(
  list: List,
  itemName: string,
  explicitCategoryId?: number | null
): Promise<number | null> {
  if (explicitCategoryId !== undefined) return explicitCategoryId

  const suggestedName = suggestCategoryName(itemName)
  if (!suggestedName) return null

  const categories = await getEffectiveCategories(list)
  return categories.find((category) => category.name === suggestedName)?.id ?? null
}

async function nextSortOrder(listId: number): Promise<number> {
  const result = await Item.query()
    .where('listId', listId)
    .whereNull('deletedAt')
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

export default class ItemsController {
  async index({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'viewer')

    const includeChecked = request.input('includeChecked', 'true') !== 'false'
    const query = Item.query().where('listId', list.id).whereNull('deletedAt')
    if (!includeChecked) query.where('checked', false)

    const items = await query.orderBy('sortOrder', 'asc')
    return serialize(ItemTransformer.transform(items))
  }

  async recent({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'viewer')

    const items = await Item.query()
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .orderBy('deletedAt', 'desc')
      .limit(50)

    return serialize(ItemTransformer.transform(items))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const payload = await request.validateUsing(createItemValidator)

    const categoryId = await resolveCategoryId(list, payload.name, payload.categoryId)

    const item = await Item.create({
      listId: list.id,
      name: payload.name,
      quantity: payload.quantity ?? null,
      notes: payload.notes ?? null,
      categoryId,
      checked: false,
      sortOrder: await nextSortOrder(list.id),
      createdBy: user.id,
    })

    await broadcastSync({ listId: list.id, entityType: 'item', entityId: item.id, op: 'create' })

    return serialize(ItemTransformer.transform(item))
  }

  async import({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const { text } = await request.validateUsing(importItemsValidator)

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    let sortOrder = await nextSortOrder(list.id)
    const items: Item[] = []
    for (const name of lines) {
      const categoryId = await resolveCategoryId(list, name)
      items.push(
        await Item.create({
          listId: list.id,
          name,
          quantity: null,
          notes: null,
          categoryId,
          checked: false,
          sortOrder: sortOrder++,
          createdBy: user.id,
        })
      )
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: list.id,
      op: 'create',
      payload: { count: items.length },
    })

    return serialize(ItemTransformer.transform(items))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateItemValidator)
    const { checked, ...rest } = payload
    item.merge(rest)
    if (checked !== undefined) {
      item.checked = checked
      item.checkedAt = checked ? DateTime.now() : null
    }
    await item.save()

    await broadcastSync({ listId: list.id, entityType: 'item', entityId: item.id, op: 'update' })

    return serialize(ItemTransformer.transform(item))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    item.deletedAt = DateTime.now()
    await item.save()

    await broadcastSync({ listId: list.id, entityType: 'item', entityId: item.id, op: 'delete' })

    return response.noContent()
  }

  async restore({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    item.deletedAt = null
    item.sortOrder = await nextSortOrder(list.id)
    await item.save()

    await broadcastSync({ listId: list.id, entityType: 'item', entityId: item.id, op: 'create' })

    return serialize(ItemTransformer.transform(item))
  }
}
