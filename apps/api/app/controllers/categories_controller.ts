import Category from '#models/category'
import ListPolicy from '#policies/list_policy'
import {
  createCategoryValidator,
  updateCategoryValidator,
  reorderCategoriesValidator,
  importCategoriesValidator,
} from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryTransformer from '#transformers/category_transformer'
import { getEffectiveCategories } from '#services/category_service'
import { broadcastSync } from '#services/sync_broadcaster'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'
import { DateTime } from 'luxon'

export default class CategoriesController {
  async index({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    const categories = await getEffectiveCategories(list)

    return serialize(CategoryTransformer.transform(categories))
  }

  async store({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
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

    logger.debug({ listId: list.id, categoryId: category.id }, 'category created')

    return serialize(CategoryTransformer.transform(category))
  }

  /**
   * Copies categories from another list into this one — the target list needs
   * `editor` (it's where categories are written) and the source list needs at
   * least `viewer` (it's only read from). Categories whose name already exists
   * on the target (case-insensitive) are skipped, so importing the same source
   * twice is idempotent. Online-only, like items/import.
   */
  async import({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const { sourceListId, categoryIds } = await request.validateUsing(importCategoriesValidator)

    if (sourceListId === list.id) {
      return response.unprocessableEntity({
        errors: [{ field: 'sourceListId', message: 'Choose a different list to import from.' }],
      })
    }

    const sourceList = await ListPolicy.requireList(user, sourceListId, 'viewer')
    const sourceCategories = await getEffectiveCategories(sourceList)
    const requestedIds = categoryIds ? new Set(categoryIds) : null
    const candidates = requestedIds
      ? sourceCategories.filter((category) => requestedIds.has(category.id))
      : sourceCategories

    const existing = await Category.query().where('listId', list.id).whereNull('deletedAt')
    const seen = new Set(existing.map((category) => category.name.trim().toLowerCase()))

    const maxSortOrder = await Category.query()
      .where('listId', list.id)
      .max('sort_order as maxSortOrder')
      .first()
    let sortOrder = Number(maxSortOrder?.$extras.maxSortOrder ?? -1) + 1

    const created: Category[] = []
    for (const source of candidates) {
      const key = source.name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const category = await Category.create({
        listId: list.id,
        name: source.name,
        icon: source.icon,
        sortOrder: sortOrder++,
        isDefault: false,
        version: 1,
      })
      created.push(category)
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: list.id,
      op: 'create',
      payload: { count: created.length },
    })

    logger.debug(
      { listId: list.id, sourceListId, createdCount: created.length },
      'categories imported'
    )

    return serialize(CategoryTransformer.transform(created))
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateCategoryValidator)
    const { expectedVersion, ...rest } = payload

    if (hasVersionConflict(category, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'category',
        id: category.id,
        expectedVersion,
        actualVersion: category.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(CategoryTransformer.transform(category))),
        conflict: true,
      })
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

    logger.debug(
      { listId: list.id, categoryId: category.id, version: category.version },
      'category updated'
    )

    return serialize(CategoryTransformer.transform(category))
  }

  async destroy({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const category = await Category.query()
      .where('id', params.categoryId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(category, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'category',
        id: category.id,
        expectedVersion,
        actualVersion: category.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(CategoryTransformer.transform(category))),
        conflict: true,
      })
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

    logger.debug({ listId: list.id, categoryId: category.id }, 'category deleted')

    return response.noContent()
  }

  async reorder({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
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

    logger.debug({ listId: list.id, count: order.length }, 'categories reordered')

    return serialize(CategoryTransformer.transform(await getEffectiveCategories(list)))
  }
}
