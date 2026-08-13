import List from '#models/list'
import Item from '#models/item'
import { createItemValidator, updateItemValidator, importItemsValidator } from '#validators/item'
import type { HttpContext } from '@adonisjs/core/http'
import ItemTransformer from '#transformers/item_transformer'
import { getEffectiveCategories } from '#services/category_service'
import { suggestCategoryName } from '#services/auto_categorize_service'
import { DateTime } from 'luxon'

async function findOwnedList(userId: number, listId: string | number) {
  return List.query()
    .where('id', listId)
    .where('ownerId', userId)
    .whereNull('deletedAt')
    .firstOrFail()
}

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
    const list = await findOwnedList(user.id, params.listId)

    const includeChecked = request.input('includeChecked', 'true') !== 'false'
    const query = Item.query().where('listId', list.id).whereNull('deletedAt')
    if (!includeChecked) query.where('checked', false)

    const items = await query.orderBy('sortOrder', 'asc')
    return serialize(ItemTransformer.transform(items))
  }

  async recent({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)

    const items = await Item.query()
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .orderBy('deletedAt', 'desc')
      .limit(50)

    return serialize(ItemTransformer.transform(items))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
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

    return serialize(ItemTransformer.transform(item))
  }

  async import({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
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

    return serialize(ItemTransformer.transform(items))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
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

    return serialize(ItemTransformer.transform(item))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    item.deletedAt = DateTime.now()
    await item.save()

    return response.noContent()
  }

  async restore({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    item.deletedAt = null
    item.sortOrder = await nextSortOrder(list.id)
    await item.save()

    return serialize(ItemTransformer.transform(item))
  }
}
