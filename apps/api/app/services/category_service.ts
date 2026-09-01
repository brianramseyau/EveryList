import type List from '#models/list'
import Category from '#models/category'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { broadcastSync } from '#services/sync_broadcaster'
import logger from '@adonisjs/core/services/logger'

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
const STARTER_CATEGORIES = [
  { name: 'Produce', icon: 'fruitCherries' },
  { name: 'Dairy', icon: 'cheese' },
  { name: 'Meat', icon: 'foodDrumstick' },
  { name: 'Bakery', icon: 'breadSlice' },
  { name: 'Frozen', icon: 'snowflake' },
  { name: 'Pantry', icon: 'foodCanArrowUp' },
  { name: 'Household', icon: 'spray' },
  { name: 'Other', icon: 'dotsHorizontalCircle' },
] as const

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
