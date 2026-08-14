import Category from '#models/category'
import ListPolicy from '#policies/list_policy'
import {
  createCategoryValidator,
  updateCategoryValidator,
  reorderCategoriesValidator,
} from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryTransformer from '#transformers/category_transformer'
import { getEffectiveCategories, forkCategoryForList } from '#services/category_service'
import { broadcastSync } from '#services/sync_broadcaster'

export default class CategoriesController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'viewer')
    const categories = await getEffectiveCategories(list)

    return serialize(CategoryTransformer.transform(categories))
  }

  async store({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
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

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'create',
    })

    return serialize(CategoryTransformer.transform(category))
  }

  async update({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where((query) => query.where('listId', list.id).orWhereNull('listId'))
      .firstOrFail()

    const payload = await request.validateUsing(updateCategoryValidator)
    const listCategory = await forkCategoryForList(list, category)
    listCategory.merge(payload)
    await listCategory.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: listCategory.id,
      op: 'update',
    })

    return serialize(CategoryTransformer.transform(listCategory))
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .firstOrFail()

    await category.delete()
    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'delete',
    })

    return response.noContent()
  }

  async reorder({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
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

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: list.id,
      op: 'update',
      payload: { categoryIds: order },
    })

    return serialize(CategoryTransformer.transform(await getEffectiveCategories(list)))
  }
}
