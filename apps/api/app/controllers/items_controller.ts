import type List from '#models/list'
import Item from '#models/item'
import Category from '#models/category'
import ListPolicy from '#policies/list_policy'
import {
  createItemValidator,
  updateItemValidator,
  importItemsValidator,
  moveItemValidator,
} from '#validators/item'
import type { HttpContext } from '@adonisjs/core/http'
import ItemTransformer from '#transformers/item_transformer'
import { suggestCategoryId } from '#services/category_suggestion_service'
import { parseBulkImport } from '#services/bulk_import_parser'
import type { CategorizeSuggestionDto } from '@everylist/shared'
import { DateTime } from 'luxon'
import { broadcastSync } from '#services/sync_broadcaster'
import {
  hasVersionConflict,
  parseExpectedVersion,
  reportVersionConflict,
} from '#services/version_conflict'

/** Matches common AnyList category headers to an existing @mdi/js icon; unknown headers get the generic 'tag'. */
const IMPORTED_CATEGORY_ICONS: Record<string, string> = {
  'produce': 'fruitCherries',
  'fruit & veg': 'fruitCherries',
  'meat': 'foodDrumstick',
  'seafood': 'fish',
  'fish': 'fish',
  'bakery': 'breadSlice',
  'dairy': 'cheese',
  'cheese': 'cheese',
  'frozen': 'snowflake',
  'beverages': 'bottleSoda',
  'drinks': 'bottleSoda',
  'snacks': 'foodApple',
  'breakfast': 'egg',
  'breakfast & cereal': 'egg',
  'cooking': 'potSteam',
  'household': 'spray',
  'chemist': 'pill',
  'chemists': 'pill',
  'pharmacy': 'pill',
  'medication': 'pill',
  'specials': 'sale',
}

function categoryIconFor(header: string): string {
  return IMPORTED_CATEGORY_ICONS[header.trim().toLowerCase()] ?? 'tag'
}

/** "BREAKFAST & CEREAL" -> "Breakfast & Cereal", matching EveryList's title-cased category names. */
function titleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(
      /(^|[\s&/\\-])([a-z])/g,
      (_match, separator: string, letter: string) => separator + letter.toUpperCase()
    )
}

async function resolveCategoryId(
  list: List,
  itemName: string,
  explicitCategoryId?: number | null
): Promise<number | null> {
  if (explicitCategoryId !== undefined) return explicitCategoryId

  return suggestCategoryId(list, itemName)
}

async function nextSortOrder(listId: number): Promise<number> {
  const result = await Item.query()
    .where('listId', listId)
    .whereNull('deletedAt')
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

// Mirrors apps/web/src/lib/item-sort-order.ts's computeMidpointSortOrder exactly: only the
// moved item's own sortOrder ever changes, to a value strictly between its new neighbors'
// *existing* sortOrder values (fractional indexing) — never a shared/derived index. No other
// row is touched, so there's nothing to collide with and no fan-out of version bumps to other
// items (this app's offline sync queue does per-row optimistic-locking on `version`, so
// touching every sibling on every move would risk spurious conflicts for concurrent edits on
// other devices). Kept in sync with the frontend's copy rather than shared, since one is
// TypeScript-in-a-Node-service and the other TypeScript-in-a-Vite-bundle with no shared runtime
// package between them for a five-line pure function.
function computeMidpointSortOrder(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** Clears `deletedAt` on an existing row (vs. creating a fresh one) so its category/store/price/
 * quantity/notes survive — shared by the explicit restore endpoint and `store()`'s implicit
 * restore-on-name-match. */
async function restoreItemRow(list: List, item: Item): Promise<void> {
  item.deletedAt = null
  item.sortOrder = await nextSortOrder(list.id)
  item.version += 1
  await item.save()

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'create',
    version: item.version,
  })
}

export default class ItemsController {
  async index({ auth, params, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    const includeChecked = request.input('includeChecked', 'true') !== 'false'
    const query = Item.query().where('listId', list.id).whereNull('deletedAt')
    if (!includeChecked) query.where('checked', false)

    const items = await query.orderBy('sortOrder', 'asc')
    return serialize(ItemTransformer.transform(items))
  }

  /** Backs the client's optimistic-row category guess — see PHASE7_PLAN.md §3. */
  async categorize({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')
    const name = request.input('name', '')
    const body: CategorizeSuggestionDto = { categoryId: await suggestCategoryId(list, name) }

    return response.ok(body)
  }

  async recent({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    const items = await Item.query()
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .orderBy('deletedAt', 'desc')
      .limit(50)

    return serialize(ItemTransformer.transform(items))
  }

  /** Distinct item names from this list's full history (incl. checked/deleted), most recent first — backs autocomplete. */
  async recentNames({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'viewer')

    // createdAt has only second-level precision, so ties are common between
    // requests in the same second — break ties by id desc so the most
    // recently *inserted* row still wins the earlier dedup slot.
    const rows = await Item.query()
      .where('listId', list.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .select('name')

    const seen = new Set<string>()
    const names: string[] = []
    for (const row of rows) {
      const key = row.name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(row.name.trim())
      if (names.length >= 50) break
    }

    // `serialize()` only wraps Lucid models/transformer output — a plain
    // string[] falls through its isObject() check and returns unwrapped,
    // so the {data: ...} envelope has to be built by hand here.
    return response.ok({ data: names })
  }

  async store({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const payload = await request.validateUsing(createItemValidator)
    const normalizedName = payload.name.trim().toLowerCase()

    logger.debug({ listId: list.id, name: payload.name }, 'item store requested')

    const existing = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .whereRaw('LOWER(TRIM(name)) = ?', [normalizedName])
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

        logger.debug(
          { listId: list.id, itemId: existing.id },
          'item store matched existing checked item, reactivated'
        )
      }

      return serialize(ItemTransformer.transform(existing))
    }

    // No active match — re-adding a name that was deleted restores its old row (category, store,
    // price, quantity, notes intact) rather than silently creating a metadata-less duplicate. See
    // AGENTS.md's "Re-adding a deleted item's name" footgun.
    const deletedMatch = await Item.query()
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .whereRaw('LOWER(TRIM(name)) = ?', [normalizedName])
      .orderBy('deletedAt', 'desc')
      .first()

    if (deletedMatch) {
      await restoreItemRow(list, deletedMatch)
      logger.debug(
        { listId: list.id, itemId: deletedMatch.id },
        'item store matched deleted item, restored'
      )
      return serialize(ItemTransformer.transform(deletedMatch))
    }

    const categoryId = await resolveCategoryId(list, payload.name, payload.categoryId)

    const item = await Item.create({
      listId: list.id,
      name: payload.name,
      quantity: payload.quantity ?? null,
      notes: payload.notes ?? null,
      categoryId,
      storeId: payload.storeId ?? null,
      price: payload.price ?? null,
      checked: false,
      sortOrder: await nextSortOrder(list.id),
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

    logger.debug({ listId: list.id, itemId: item.id }, 'item created')

    return serialize(ItemTransformer.transform(item))
  }

  async import({ auth, params, request, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const { text } = await request.validateUsing(importItemsValidator)

    const parsed = parseBulkImport(text)
    logger.debug(
      { listId: list.id, sectionCount: parsed.sections.length },
      'item bulk import requested'
    )

    // Section headers become the item's category — an existing category with
    // the same name (case-insensitive) is reused, otherwise a new one is
    // created so the AnyList category structure carries over wholesale.
    const categoryIdsByHeader = new Map<string, number>()
    const maxCategorySortOrder = await Category.query()
      .where('listId', list.id)
      .max('sort_order as maxSortOrder')
      .first()
    let categorySortOrder = Number(maxCategorySortOrder?.$extras.maxSortOrder ?? -1) + 1

    async function resolveSectionCategory(header: string | null): Promise<number | null> {
      if (!header) return null
      const key = header.trim().toLowerCase()
      if (categoryIdsByHeader.has(key)) return categoryIdsByHeader.get(key)!

      const existing = await Category.query()
        .where('listId', list.id)
        .whereNull('deletedAt')
        .whereRaw('LOWER(TRIM(name)) = ?', [key])
        .first()
      if (existing) {
        categoryIdsByHeader.set(key, existing.id)
        return existing.id
      }

      const category = await Category.create({
        listId: list.id,
        name: titleCase(header),
        icon: categoryIconFor(header),
        sortOrder: categorySortOrder++,
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
      logger.debug(
        { listId: list.id, categoryId: category.id, header },
        'created category from import section header'
      )
      categoryIdsByHeader.set(key, category.id)
      return category.id
    }

    let sortOrder = await nextSortOrder(list.id)
    const items: Item[] = []
    for (const section of parsed.sections) {
      const sectionCategoryId = await resolveSectionCategory(section.header)
      for (const parsedItem of section.items) {
        const categoryId = sectionCategoryId ?? (await suggestCategoryId(list, parsedItem.name))
        items.push(
          await Item.create({
            listId: list.id,
            name: parsedItem.name,
            quantity: null,
            notes: parsedItem.notes.length > 0 ? parsedItem.notes.join('\n').slice(0, 1000) : null,
            categoryId,
            price: parsedItem.price,
            checked: false,
            sortOrder: sortOrder++,
            createdBy: user.id,
            version: 1,
          })
        )
      }
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: list.id,
      op: 'create',
      payload: { count: items.length },
    })

    logger.debug({ listId: list.id, itemCount: items.length }, 'item bulk import completed')

    return serialize(ItemTransformer.transform(items))
  }

  async update({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const payload = await request.validateUsing(updateItemValidator)
    const { checked, expectedVersion, ...rest } = payload

    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(item))),
        conflict: true,
      })
    }

    item.merge(rest)
    if (checked !== undefined) {
      item.checked = checked
      item.checkedAt = checked ? DateTime.now() : null
    }
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'update',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id, version: item.version }, 'item updated')

    return serialize(ItemTransformer.transform(item))
  }

  /** Repositions a single item within the list — one item, one neighbor reference, one row
   * touched (see computeMidpointSortOrder above). Mirrors the drag-and-drop UI's
   * `handleItemDrop`, and matches Home Assistant's `todo.move_item` service (`item` +
   * `previous_uid`) closely enough to back it directly, unlike the folders/lists/categories
   * `reorder` endpoints, which take a full `order: number[]` and renumber every row — a shape
   * that doesn't fit items' fractional-indexing design. */
  async move({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const { previousItemId, expectedVersion } = await request.validateUsing(moveItemValidator)

    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(item))),
        conflict: true,
      })
    }

    const siblings = await Item.query()
      .where('listId', list.id)
      .whereNull('deletedAt')
      .whereNot('id', item.id)
      .orderBy('sortOrder', 'asc')

    let precedingIndex = -1
    if (previousItemId !== undefined && previousItemId !== null) {
      precedingIndex = siblings.findIndex((sibling) => sibling.id === previousItemId)
      if (precedingIndex === -1) {
        return response.badRequest({
          message: 'previousItemId must reference a different active item in this list',
        })
      }
    }

    item.sortOrder = computeMidpointSortOrder(
      siblings[precedingIndex]?.sortOrder,
      siblings[precedingIndex + 1]?.sortOrder
    )
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'update',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id, sortOrder: item.sortOrder }, 'item moved')

    return serialize(ItemTransformer.transform(item))
  }

  async destroy({ auth, params, request, response, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNull('deletedAt')
      .firstOrFail()

    const expectedVersion = parseExpectedVersion(request)
    if (hasVersionConflict(item, expectedVersion)) {
      reportVersionConflict(request, logger, {
        entity: 'item',
        id: item.id,
        expectedVersion,
        actualVersion: item.version,
        userId: user.id,
      })
      return response.conflict({
        ...(await serialize(ItemTransformer.transform(item))),
        conflict: true,
      })
    }

    item.deletedAt = DateTime.now()
    item.version += 1
    await item.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: item.id,
      op: 'delete',
      version: item.version,
    })

    logger.debug({ listId: list.id, itemId: item.id }, 'item deleted')

    return response.noContent()
  }

  async restore({ auth, params, serialize, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    await restoreItemRow(list, item)

    logger.debug({ listId: list.id, itemId: item.id }, 'item restored')

    return serialize(ItemTransformer.transform(item))
  }

  /** Hard-deletes an already-soft-deleted row — the "Recently Deleted" page's permanent-delete
   * action, for a test item or typo that shouldn't be kept around waiting to be restored. Only
   * reachable for a row that's already soft-deleted, so an active item can't be purged without
   * going through `destroy` first. */
  async purge({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const list = await ListPolicy.requireList(user, params.listId, 'editor')
    const item = await Item.query()
      .where('id', params.itemId)
      .where('listId', list.id)
      .whereNotNull('deletedAt')
      .firstOrFail()

    const itemId = item.id
    await item.delete()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: itemId,
      op: 'purge',
    })

    logger.debug({ listId: list.id, itemId }, 'item purged')

    return response.noContent()
  }
}
