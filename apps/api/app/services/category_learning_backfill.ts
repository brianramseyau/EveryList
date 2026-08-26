import { tokenizeItemName } from '@everylist/shared'

/**
 * The grouping half of the Phase 17 backfill (see the
 * `create_category_learnings_table` migration): turns a set of historical
 * items into one (list, token, category) learning row each, summing `count`
 * and keeping the most recent `lastSeenAt`. Extracted from the migration so
 * it can be unit-tested without driving the migration runner.
 */

export interface BackfillItemRow {
  listId: number
  categoryId: number
  name: string
  /** A lexicographically sortable timestamp (SQLite's `YYYY-MM-DD HH:mm:ss`). */
  lastSeenAt: string
}

export interface CategoryLearningGroup {
  listId: number
  categoryId: number
  token: string
  count: number
  lastSeenAt: string
}

export function groupCategoryLearningsFromItems(
  items: readonly BackfillItemRow[]
): CategoryLearningGroup[] {
  const groups = new Map<string, CategoryLearningGroup>()

  for (const item of items) {
    for (const token of tokenizeItemName(item.name)) {
      const key = `${item.listId}:${item.categoryId}:${token}`
      const group = groups.get(key)
      if (group) {
        group.count += 1
        if (item.lastSeenAt > group.lastSeenAt) group.lastSeenAt = item.lastSeenAt
      } else {
        groups.set(key, {
          listId: item.listId,
          categoryId: item.categoryId,
          token,
          count: 1,
          lastSeenAt: item.lastSeenAt,
        })
      }
    }
  }

  return [...groups.values()]
}
