import type List from '#models/list'
import Category from '#models/category'

/**
 * Merges a list's own category overrides with the global default
 * categories (listId: null), letting a list-scoped category with the same
 * name shadow the global default it customizes — see PLAN.md §7.
 */
export async function getEffectiveCategories(list: List): Promise<Category[]> {
  const [customCategories, defaultCategories] = await Promise.all([
    Category.query().where('listId', list.id).orderBy('sortOrder', 'asc'),
    Category.query().whereNull('listId').orderBy('sortOrder', 'asc'),
  ])

  const customNames = new Set(customCategories.map((category) => category.name))
  const merged = [
    ...customCategories,
    ...defaultCategories.filter((category) => !customNames.has(category.name)),
  ]
  merged.sort((a, b) => a.sortOrder - b.sortOrder)
  return merged
}

/**
 * Returns a list-scoped copy of a global default category so it can be
 * renamed/re-iconed/reordered without affecting every other list that
 * still uses the shared default — creating it on first customization.
 */
export async function forkCategoryForList(list: List, category: Category): Promise<Category> {
  if (category.listId === list.id) {
    return category
  }

  return Category.create({
    listId: list.id,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isDefault: false,
  })
}
