import Category from '#models/category'
import Item from '#models/item'
import FavoriteItem from '#models/favorite_item'
import ListPolicy from '#policies/list_policy'
import {
  createCategoryValidator,
  updateCategoryValidator,
  reorderCategoriesValidator,
  importCategoriesValidator,
  bulkImportCategoriesValidator,
} from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryTransformer from '#transformers/category_transformer'
import { getEffectiveCategories } from '#services/category_service'
import {
  matchCategoryIcon,
  normalizeCategoryName,
  parseCategoryNames,
} from '#services/category_bulk_import'
import { broadcastSync } from '#services/sync_broadcaster'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

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

  /**
   * Creates categories from a pasted list of names, one per line (an optional leading bullet is
   * stripped) — the same "paste a list, get it turned into rows" shape as bulk item import, and
   * reusing that feature's header→icon matching (`category_bulk_import.ts`) to guess a relatable
   * icon per name instead of dumping everything under the generic 'tag'. A pasted name that
   * matches an existing category (case-insensitive) is skipped, so pasting the same list twice —
   * or a list with repeated lines — is idempotent, mirroring `import`'s dedup-by-name behavior.
   */
  async bulkImport({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const { text } = await request.validateUsing(bulkImportCategoriesValidator)

    const existing = await Category.query().where('listId', list.id).whereNull('deletedAt')
    const seen = new Set(existing.map((category) => category.name.trim().toLowerCase()))

    const maxSortOrder = await Category.query()
      .where('listId', list.id)
      .max('sort_order as maxSortOrder')
      .first()
    let sortOrder = Number(maxSortOrder?.$extras.maxSortOrder ?? -1) + 1

    const created: Category[] = []
    for (const rawName of parseCategoryNames(text)) {
      const name = normalizeCategoryName(rawName)
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      const category = await Category.create({
        listId: list.id,
        name,
        icon: matchCategoryIcon(rawName),
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
      { listId: list.id, createdCount: created.length },
      'categories bulk imported from pasted text'
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

  /**
   * Deletes (soft) this category. Unlike a store detach, a category is never hard-removed from
   * anything — there's no pivot row whose disappearance items/favorites can be checked against —
   * so `deletedAt` is the only signal that `categoryId`/`defaultCategoryId` now points at a dead
   * row, and that row still exists for a straight foreign-key lookup to find. Orphan them (null
   * out the reference) in the same transaction as the soft-delete, the same way `StoresController
   * #detach` orphans items/favorites left pointing at a detached store — otherwise they'd keep a
   * stale category id that the list page's category grouping silently drops (it only renders
   * buckets for categories `getEffectiveCategories` still returns), making the item disappear from
   * view while still being counted by anything that reads the raw list rather than the rendered
   * groups. Not scoped to this list: unlike a store (legitimately attachable to several lists via
   * `list_stores`), a category id only ever means one list's category, so a row on any list is
   * stale the moment this one is gone — `resolveCategoryId` (items_controller.ts) doesn't check
   * that an explicit `categoryId` belongs to the item's own list, so such a row is reachable today,
   * and the backfill migration below already orphans it on that global rule; scoping this query to
   * `list.id` would leave the two disagreeing. (The broadcast below stays scoped to this list — a
   * stray cross-list row misses the live push but self-corrects on that other list's next fetch,
   * same as the migration itself, which sends none at all.) Runs against every item/favorite
   * regardless of deletedAt, so a later restore from Recently Deleted doesn't resurrect the same
   * stale reference. Broadcasts are batched (one per affected entity type, not one per row) and
   * sent after commit — see `detach`'s doc comment for why.
   */
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

    const { orphanedItemCount, orphanedFavoriteCount } = await db.transaction(async (trx) => {
      category.useTransaction(trx)
      category.deletedAt = DateTime.now()
      category.version += 1
      await category.save()

      const items = await Item.query({ client: trx }).where('categoryId', category.id)
      for (const item of items) {
        item.categoryId = null
        item.version += 1
        await item.useTransaction(trx).save()
      }

      const favorites = await FavoriteItem.query({ client: trx }).where(
        'defaultCategoryId',
        category.id
      )
      for (const favorite of favorites) {
        favorite.defaultCategoryId = null
        favorite.version += 1
        await favorite.useTransaction(trx).save()
      }

      return { orphanedItemCount: items.length, orphanedFavoriteCount: favorites.length }
    })

    if (orphanedItemCount > 0) {
      await broadcastSync({
        listId: list.id,
        entityType: 'item',
        entityId: list.id,
        op: 'update',
        payload: { categoryId: category.id, count: orphanedItemCount },
      })
    }
    if (orphanedFavoriteCount > 0) {
      await broadcastSync({
        listId: list.id,
        entityType: 'favorite_item',
        entityId: list.id,
        op: 'update',
        payload: { categoryId: category.id, count: orphanedFavoriteCount },
      })
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'delete',
      version: category.version,
    })

    logger.debug(
      { listId: list.id, categoryId: category.id, orphanedItemCount, orphanedFavoriteCount },
      'category deleted; its items and favorites orphaned'
    )

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
