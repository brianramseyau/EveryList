import type List from '#models/list'
import Category from '#models/category'
import CategoryLearning from '#models/category_learning'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { broadcastSync } from '#services/sync_broadcaster'
import logger from '@adonisjs/core/services/logger'
import { STARTER_CATEGORY_KEYWORDS, tokenizeItemName } from '@everylist/shared'
import type { StarterCategoryKey } from '@everylist/shared'
import { DateTime } from 'luxon'

/** A list's own categories, in display order. */
export async function getEffectiveCategories(list: List): Promise<Category[]> {
  return Category.query()
    .where('listId', list.id)
    .whereNull('deletedAt')
    .orderBy('sortOrder', 'asc')
}

/**
 * Grocery aisle categories, used only to seed a brand-new user's first
 * ("Shopping List") list — see #controllers/new_account_controller. Not a
 * shared/global fallback: a list that doesn't want these (a todo list, a
 * packing list) can freely rename or delete them since they're just
 * ordinary list-scoped categories from the moment they're created.
 */
const STARTER_CATEGORIES: ReadonlyArray<{
  key: StarterCategoryKey | null
  name: string
  icon: string
}> = [
  { key: 'produce', name: 'Produce', icon: 'fruitCherries' },
  { key: 'dairy', name: 'Dairy', icon: 'cheese' },
  { key: 'meat', name: 'Meat', icon: 'foodDrumstick' },
  { key: 'bakery', name: 'Bakery', icon: 'breadSlice' },
  { key: 'frozen', name: 'Frozen', icon: 'snowflake' },
  { key: 'pantry', name: 'Pantry', icon: 'foodCanArrowUp' },
  { key: 'household', name: 'Household', icon: 'spray' },
  // "Other" has no seed keywords, but it is still a seeded starter category.
  { key: null, name: 'Other', icon: 'dotsHorizontalCircle' },
]

/**
 * Bootstraps the learned model for a freshly seeded category: the keyword table is data for the
 * model, not a runtime matcher (PLAN_37 Phase B). Rows are attached to the category id, so renames
 * are safe and deletion cascades them away. Duplicate tokens across keywords (berry/berries) merge
 * into one row whose count reflects both.
 */
async function seedStarterCategoryLearnings(
  list: List,
  category: Category,
  key: StarterCategoryKey,
  client?: QueryClientContract
): Promise<void> {
  if (list.useCategoryLearning === false) return

  const counts = new Map<string, number>()
  for (const keyword of STARTER_CATEGORY_KEYWORDS[key]) {
    for (const token of tokenizeItemName(keyword)) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }

  const now = DateTime.now()
  for (const [token, count] of counts) {
    await CategoryLearning.create(
      { listId: list.id, categoryId: category.id, token, count, lastSeenAt: now },
      { client }
    )
  }
}

export async function seedStarterCategories(
  list: List,
  client?: QueryClientContract
): Promise<Category[]> {
  const categories: Category[] = []

  for (const [index, starter] of STARTER_CATEGORIES.entries()) {
    const category = await Category.create(
      {
        listId: list.id,
        name: starter.name,
        icon: starter.icon,
        sortOrder: index,
        isDefault: false,
        version: 1,
      },
      { client }
    )
    categories.push(category)

    if (starter.key) {
      await seedStarterCategoryLearnings(list, category, starter.key, client)
    }

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: category.id,
      op: 'create',
      version: category.version,
      client,
    })
  }

  logger.debug({ listId: list.id, categoryCount: categories.length }, 'seeded starter categories')

  return categories
}
