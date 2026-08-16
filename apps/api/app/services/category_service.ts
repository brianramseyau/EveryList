import type List from '#models/list'
import Category from '#models/category'
import Item from '#models/item'

/**
 * Merges a list's own category overrides with the global default
 * categories (listId: null), letting a list-scoped category shadow the
 * exact global default it was forked from (see forkCategoryForList) —
 * tracked by id via `forkedFromId`, not by name, so renaming an override
 * doesn't un-shadow the default it replaced — see PLAN.md §7.
 */
export async function getEffectiveCategories(list: List): Promise<Category[]> {
  const [customCategories, defaultCategories] = await Promise.all([
    Category.query().where('listId', list.id).whereNull('deletedAt').orderBy('sortOrder', 'asc'),
    Category.query().whereNull('listId').whereNull('deletedAt').orderBy('sortOrder', 'asc'),
  ])

  const shadowedIds = new Set(
    customCategories
      .map((category) => category.forkedFromId)
      .filter((id): id is number => id !== null)
  )
  const merged = [
    ...customCategories,
    ...defaultCategories.filter((category) => !shadowedIds.has(category.id)),
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

  const forked = await Category.create({
    listId: list.id,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isDefault: false,
    forkedFromId: category.id,
    version: 1,
  })

  // Items already assigned to the global default being shadowed must move
  // to the new list-scoped fork, or getEffectiveCategories excludes the
  // shadowed global id and the items become orphaned (invisible in the UI).
  await Item.query().where('listId', list.id).where('categoryId', category.id).update({
    categoryId: forked.id,
  })

  return forked
}
