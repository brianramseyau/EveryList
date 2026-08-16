import Category from '#models/category'
import ListPolicy from '#policies/list_policy'
import {
  createCategoryValidator,
  updateCategoryValidator,
  reorderCategoriesValidator,
} from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryTransformer from '#transformers/category_transformer'
import { getEffectiveCategories } from '#services/category_service'
import { broadcastSync } from '#services/sync_broadcaster'
import { hasVersionConflict, parseExpectedVersion } from '#services/version_conflict'
import { DateTime } from 'luxon'

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
      version: 1,
    })

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'create',
      version: category.version,
    })

    return serialize(CategoryTransformer.transform(category))
  }

  async update({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateCategoryValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(category, expectedVersion)) {
      return response
        .status(409)
        .send({ ...(await serialize(CategoryTransformer.transform(category))), conflict: true })
    }

    category.merge(rest)
    category.version += 1
    await category.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'update',
      version: category.version,
    })

    return serialize(CategoryTransformer.transform(category))
  }

  async destroy({ auth, params, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(category, expectedVersion)) {
      return response
        .status(409)
        .send({ ...(await serialize(CategoryTransformer.transform(category))), conflict: true })
    }

    category.deletedAt = DateTime.now()
    category.version += 1
    await category.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'delete',
      version: category.version,
    })

    return response.noContent()
  }

  async reorder({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user.id, params.listId, 'editor')
    const { order } = await request.validateUsing(reorderCategoriesValidator)

    const categories = await Category.query()
      .whereIn('id', order)
      .where('listId', list.id)
      .whereNull('deletedAt')

    const categoriesById = new Map(categories.map((category) => [category.id, category]))

    for (const [index, categoryId] of order.entries()) {
      const category = categoriesById.get(categoryId)
      if (!category) continue

      category.sortOrder = index
      category.version += 1
      await category.save()
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
