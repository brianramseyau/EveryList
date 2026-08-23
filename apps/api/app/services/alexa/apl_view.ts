import Item from '#models/item'
import type Category from '#models/category'
import type List from '#models/list'
import { getEffectiveCategories } from '#services/category_service'
import { LIST_VIEW_DOCUMENT } from '#services/alexa/apl_document'

type ListRow =
  { type: 'header'; text: string } | { type: 'item'; id: number; name: string; checked: boolean }

/** Unchecked items before checked ones, each group in `sortOrder`. */
function sortBucket(bucket: Item[]): Item[] {
  return [...bucket].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    return a.sortOrder - b.sortOrder
  })
}

/**
 * Category-grouped, checked-items-included item rows for the APL list view
 * (PHASE16_PLAN.md Stage 3), flattened into one array with a `type` discriminator
 * (`header`/`item`) rather than nested per-category lists — see `apl_document.ts` for why.
 * Unlike the spoken summary (`intent_router.ts`'s `handleReadList`, unchecked-only), checked
 * items are included here — struck through, grouped after unchecked ones within each category —
 * mirroring the main app's list view, which keeps checked items visible rather than hiding them.
 */
function buildRows(items: Item[], categories: Category[]): ListRow[] {
  const byCategory = new Map<number, Item[]>()
  const uncategorized: Item[] = []

  for (const item of items) {
    if (item.categoryId === null) {
      uncategorized.push(item)
      continue
    }
    const bucket = byCategory.get(item.categoryId)
    if (bucket) bucket.push(item)
    else byCategory.set(item.categoryId, [item])
  }

  const rows: ListRow[] = []
  for (const category of categories) {
    const bucket = byCategory.get(category.id)
    if (!bucket || bucket.length === 0) continue
    rows.push({ type: 'header', text: category.name })
    for (const item of sortBucket(bucket)) {
      rows.push({ type: 'item', id: item.id, name: item.name, checked: item.checked })
    }
  }

  if (uncategorized.length > 0) {
    rows.push({ type: 'header', text: 'Other' })
    for (const item of sortBucket(uncategorized)) {
      rows.push({ type: 'item', id: item.id, name: item.name, checked: item.checked })
    }
  }

  return rows
}

/**
 * Builds the `Alexa.Presentation.APL.RenderDocument` directive for `list`, always querying its
 * current active items/categories fresh rather than accepting them as parameters — callers
 * (`alexa_controller.ts`) invoke this after any mutation completes, so a caller-supplied,
 * pre-mutation array would risk showing stale state. This is the only place that query happens,
 * so `LaunchRequest`, `ReadListIntent`, every mutating intent, and the touch-completion path all
 * show identically-built, always-current displays.
 */
export async function buildListDisplay(list: List) {
  const [items, categories] = await Promise.all([
    Item.query().where('listId', list.id).whereNull('deletedAt').orderBy('sortOrder', 'asc'),
    getEffectiveCategories(list),
  ])

  return {
    type: 'Alexa.Presentation.APL.RenderDocument' as const,
    token: `list-${list.id}`,
    document: LIST_VIEW_DOCUMENT,
    datasources: {
      listData: {
        type: 'object',
        properties: {
          listId: list.id,
          listName: list.name,
          rows: buildRows(items, categories),
        },
      },
    },
  }
}
