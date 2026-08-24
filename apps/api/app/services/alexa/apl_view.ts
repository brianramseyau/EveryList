import Item from '#models/item'
import type Category from '#models/category'
import type List from '#models/list'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { appUrl } from '#config/app'
import { getEffectiveCategories } from '#services/category_service'
import { LIST_VIEW_DOCUMENT } from '#services/alexa/apl_document'

type ListRow =
  | { type: 'header'; text: string; iconUrl: string }
  | { type: 'item'; id: number; name: string; checked: boolean }

/**
 * Builds a public URL for `alexa_icons_controller.ts` to render `iconName` tinted with
 * `colorHex` (the list's own `color`, matching how the app itself colors category headers) —
 * `iconName` is untrusted user input in the general case (any string a user picks for a custom
 * category), but the controller re-validates it before touching the filesystem/renderer, so no
 * validation is needed here.
 */
export function buildIconUrl(iconName: string, colorHex: string): string {
  return `${appUrl}/api/v1/alexa/icons/${iconName}?color=${colorHex.replace('#', '')}`
}

// Matches the DB column default (`create_lists_table.ts`) — `List.create()` doesn't refresh a
// model with the DB-assigned default when the caller omits `color`, so a list created that way
// (as most tests, and any future direct `List.create()` call, do) would otherwise carry
// `color: undefined` here even though a real row always has one.
const DEFAULT_LIST_COLOR = '#3b82f6'

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
function buildRows(items: Item[], categories: Category[], listColor: string): ListRow[] {
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
    rows.push({
      type: 'header',
      text: category.name,
      iconUrl: buildIconUrl(category.icon, listColor),
    })
    for (const item of sortBucket(bucket)) {
      rows.push({ type: 'item', id: item.id, name: item.name, checked: item.checked })
    }
  }

  if (uncategorized.length > 0) {
    rows.push({
      type: 'header',
      text: 'Other',
      iconUrl: buildIconUrl('dotsHorizontalCircle', listColor),
    })
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

  const listColor = list.color ?? DEFAULT_LIST_COLOR
  const rows = buildRows(items, categories, listColor)
  logger.debug(
    {
      listId: list.id,
      itemCount: items.length,
      categoryCount: categories.length,
      rowCount: rows.length,
    },
    'built Alexa APL list display'
  )

  return {
    type: 'Alexa.Presentation.APL.RenderDocument' as const,
    // Keyed by the running build's commit, not just the list id (`apl_touch_handler.ts` never
    // reads this token back — `SendEvent`'s `arguments` array carries everything a touch handler
    // needs), so any on-device cache is invalidated whenever this document actually changes.
    token: `list-${list.id}-${env.get('GIT_SHA', 'unknown')}`,
    document: LIST_VIEW_DOCUMENT,
    datasources: {
      listData: {
        type: 'object',
        properties: {
          listId: list.id,
          listName: list.name,
          listColor,
          // `list.icon` can be null (no icon chosen) — the document only renders the
          // `Image` when this is non-empty, so an empty string is the "nothing to show" state.
          listIconUrl: list.icon ? buildIconUrl(list.icon, listColor) : '',
          // Item-row sizing, bound rather than literal in `apl_document.ts` — real-device testing
          // (Echo Show) showed literal style constants on already-declared components (fontSize,
          // a checkbox Frame's marginRight) not visibly updating across several redeploys, while
          // genuinely data-bound values (item names, checked state) reliably updated every turn,
          // and a brand-new sibling component's own literal properties rendered correctly the
          // first time it appeared. Routing these through datasources instead sidesteps whatever
          // that device-side staleness is by putting them on the same update path already proven
          // to work turn to turn.
          itemFontSize: '30dp',
          checkboxSize: '22dp',
          checkboxRadius: '5dp',
          checkboxGap: '16dp',
          rows,
        },
      },
    },
  }
}
