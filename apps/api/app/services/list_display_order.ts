import type Item from '#models/item'
import type Category from '#models/category'
import type List from '#models/list'

/**
 * Flattens a list's items into the same order the app's own grouped display uses
 * (`groups` in `apps/web/src/routes/lists/[id]/+page.svelte`) — category clusters first
 * (ordered by each category's own `sortOrder`, uncategorized items last), then items within
 * each cluster ordered by the list's `itemSortOrder`. Presentation-agnostic on purpose: callers
 * that need category headers, icons, or struck-through styling (the Alexa APL display, the
 * Android widget's flat list, and eventually iOS) each build their own rows on top of this;
 * this only decides the order.
 */
export function buildFlatDisplayOrder(
  list: List,
  items: Item[],
  categories: Category[],
  { includeChecked }: { includeChecked: boolean }
): Item[] {
  const visible = includeChecked ? items : items.filter((item) => !item.checked)

  const byName = (a: Item, b: Item) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const byRank = (a: Item, b: Item) => a.sortOrder - b.sortOrder
  // PLAN_24_PHASE_ITEM_DEADLINES.md: deadline ascending — ISO 'YYYY-MM-DD' and
  // 'YYYY-MM-DDTHH:mm' compare correctly as plain strings — with same-deadline
  // ties broken by name; items without a deadline keep their manual rank order
  // at the end. Must mirror the web app's sortItemsWithinBucket.
  const byDeadline = (a: Item, b: Item) => {
    if (a.deadline === null && b.deadline === null) return byRank(a, b)
    if (a.deadline === null) return 1
    if (b.deadline === null) return -1
    return a.deadline.localeCompare(b.deadline) || byName(a, b)
  }
  const compare =
    list.itemSortOrder === 'alphabetical'
      ? byName
      : list.itemSortOrder === 'deadline'
        ? byDeadline
        : byRank

  // Lists that opt out of categories render as one flat, unclustered group. Explicit `=== false`
  // (not `!list.useCategories`) since missing/undefined means the server default, `true` — same
  // convention the web app's `groups` derived value uses, and needed since a model built via
  // `List.create()` without passing the field doesn't reload the DB-assigned default.
  if (list.useCategories === false) return [...visible].sort(compare)

  const byCategory = new Map<number, Item[]>()
  const uncategorized: Item[] = []
  for (const item of visible) {
    if (item.categoryId === null) {
      uncategorized.push(item)
      continue
    }
    const bucket = byCategory.get(item.categoryId)
    if (bucket) bucket.push(item)
    else byCategory.set(item.categoryId, [item])
  }

  const ordered: Item[] = []
  for (const category of categories) {
    const bucket = byCategory.get(category.id)
    if (!bucket || bucket.length === 0) continue
    ordered.push(...[...bucket].sort(compare))
  }
  ordered.push(...[...uncategorized].sort(compare))
  return ordered
}
