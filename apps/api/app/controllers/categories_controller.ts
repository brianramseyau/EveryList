import List from '#models/list'
import Category from '#models/category'
import {
  createCategoryValidator,
  updateCategoryValidator,
  reorderCategoriesValidator,
} from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryTransformer from '#transformers/category_transformer'
import { getEffectiveCategories, forkCategoryForList } from '#services/category_service'

async function findOwnedList(userId: number, listId: string | number) {
  return List.query()
    .where('id', listId)
    .where('ownerId', userId)
    .whereNull('deletedAt')
    .firstOrFail()
}

export default class CategoriesController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const categories = await getEffectiveCategories(list)

    return serialize(CategoryTransformer.transform(categories))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const payload = await request.validateUsing(createCategoryValidator)

    const maxSortOrder = await Category.query()
      .where('listId', list.id)
      .max('sort_order as maxSortOrder')
      .first()
    const nextSortOrder = Number(maxSortOrder?.$extras.maxSortOrder ?? -1) + 1

    const category = await Category.create({
      listId: list.id,
      name: payload.name,
      icon: payload.icon,
      sortOrder: nextSortOrder,
      isDefault: false,
    })

    return serialize(CategoryTransformer.transform(category))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const category = await Category.query()
      .where('id', params.categoryId)
      .where((query) => query.where('listId', list.id).orWhereNull('listId'))
      .firstOrFail()

    const payload = await request.validateUsing(updateCategoryValidator)
    const listCategory = await forkCategoryForList(list, category)
    listCategory.merge(payload)
    await listCategory.save()

    return serialize(CategoryTransformer.transform(listCategory))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .firstOrFail()

    await category.delete()
    return response.noContent()
  }

  async reorder({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await findOwnedList(user.id, params.listId)
    const { order } = await request.validateUsing(reorderCategoriesValidator)

    const categories = await Category.query()
      .whereIn('id', order)
      .where((query) => query.where('listId', list.id).orWhereNull('listId'))

    const categoriesById = new Map(categories.map((category) => [category.id, category]))

    for (const [index, categoryId] of order.entries()) {
      const category = categoriesById.get(categoryId)
      if (!category) continue

      const listCategory = await forkCategoryForList(list, category)
      listCategory.sortOrder = index
      await listCategory.save()
    }

    return serialize(CategoryTransformer.transform(await getEffectiveCategories(list)))
  }
}
