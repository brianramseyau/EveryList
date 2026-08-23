import Item from '#models/item'
import type List from '#models/list'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'
import { suggestCategoryId } from '#services/category_suggestion_service'
import { broadcastSync } from '#services/sync_broadcaster'
import { closestMatch } from '#services/alexa/fuzzy_match'
import { resolveList, roleFor } from '#services/alexa/list_resolution'
import { say, type AlexaResponse } from '#services/alexa/response_builder'

type AlexaSlots = Record<string, string | undefined>

/**
 * Every intent handler's result: the spoken response, plus the list it acted on when one was
 * successfully resolved — `alexa_controller.ts` uses `list` to attach an APL display directive
 * for screen devices (PHASE16_PLAN.md Stage 3). `list` is omitted when there's nothing sensible
 * to show: a not-found/ambiguous list, or a request that never got far enough to resolve one
 * (e.g. no `ItemName` slot at all).
 */
export type IntentResult = { response: AlexaResponse; list?: List }

function respond(response: AlexaResponse, list?: List): IntentResult {
  return list ? { response, list } : { response }
}

// Mirrors items_controller.ts's own private copy — see that file's comment on
// why this five-line helper isn't shared through packages/shared.
async function nextSortOrder(listId: number): Promise<number> {
  const result = await Item.query()
    .where('listId', listId)
    .whereNull('deletedAt')
    .max('sort_order as maxSortOrder')
    .first()
  return Number(result?.$extras.maxSortOrder ?? -1) + 1
}

async function activeItems(listId: number): Promise<Item[]> {
  return Item.query().where('listId', listId).whereNull('deletedAt')
}

function speakAmbiguousLists(options: List[]): AlexaResponse {
  const names = options.map((list) => list.name).join(', ')
  return say(`Which list did you mean: ${names}?`, { reprompt: 'Which list did you mean?' })
}

async function resolveListOrRespond(
  token: AccessToken,
  listNameSlot: string | undefined
): Promise<{ list: List } | { response: AlexaResponse }> {
  const resolution = await resolveList(token, listNameSlot)
  if (resolution.kind === 'found') return { list: resolution.list }
  if (resolution.kind === 'ambiguous') return { response: speakAmbiguousLists(resolution.options) }
  return { response: say("I couldn't find that list.") }
}

/**
 * Marks an active item done — the shared mutation behind both the voice `CompleteItemIntent`
 * path below and the touch-driven completion path (`apl_touch_handler.ts`, PHASE16_PLAN.md
 * Stage 3), so the version bump/`checkedAt`/`broadcastSync` sequence exists in exactly one place.
 */
export async function completeItemRow(list: List, item: Item): Promise<void> {
  item.checked = true
  item.checkedAt = DateTime.now()
  item.version += 1
  await item.save()

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'update',
    version: item.version,
  })
}

/**
 * Reverses `completeItemRow` — the touch-driven counterpart to tapping an already-checked item
 * on-screen (`apl_touch_handler.ts`, PHASE16_PLAN.md Stage 3). There's no voice equivalent (no
 * `UncheckItemIntent` exists; the closest voice path is re-saying an item's name via
 * `handleAddItem`, which restores it as a side effect of its own dedup logic) — this only exists
 * for the tap gesture, so it lives here as its own function rather than folded into that.
 */
export async function uncheckItemRow(list: List, item: Item): Promise<void> {
  item.checked = false
  item.checkedAt = null
  item.version += 1
  await item.save()

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'update',
    version: item.version,
  })
}

/**
 * `AddItemIntent` — fuzzy-matches the spoken name against the list's existing item names first
 * (catching near-miss transcriptions like "miilk" vs "milk", per PHASE16_PLAN.md Stage 2) before
 * falling back to the API's own exact-match dedup/restore behavior that `items_controller.ts`'s
 * `store()` already implements; re-adding a checked or deleted item's name there restores it
 * rather than creating a metadata-less duplicate, so it's reused wholesale here instead of
 * reimplemented.
 */
export async function handleAddItem(token: AccessToken, slots: AlexaSlots): Promise<IntentResult> {
  const itemName = slots.ItemName?.trim()
  if (!itemName) return respond(say("I didn't catch what to add."))

  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return respond(resolved.response)
  const list = resolved.list

  if (roleFor(token, list.id) !== 'editor') {
    return respond(say(`You only have view access to ${list.name}, so I can't add to it.`), list)
  }

  const normalizedName = itemName.toLowerCase()
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
    }
    return respond(say(`${existing.name} is already on ${list.name}.`), list)
  }

  const deletedMatch = await Item.query()
    .where('listId', list.id)
    .whereNotNull('deletedAt')
    .whereRaw('LOWER(TRIM(name)) = ?', [normalizedName])
    .orderBy('deletedAt', 'desc')
    .first()

  if (deletedMatch) {
    deletedMatch.deletedAt = null
    deletedMatch.sortOrder = await nextSortOrder(list.id)
    deletedMatch.version += 1
    await deletedMatch.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: deletedMatch.id,
      op: 'create',
      version: deletedMatch.version,
    })
    return respond(say(`Added ${deletedMatch.name} to ${list.name}.`), list)
  }

  const item = await Item.create({
    listId: list.id,
    name: itemName,
    quantity: null,
    notes: null,
    categoryId: await suggestCategoryId(list, itemName),
    storeId: null,
    price: null,
    checked: false,
    sortOrder: await nextSortOrder(list.id),
    createdBy: Number(token.tokenableId),
    version: 1,
  })

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: item.id,
    op: 'create',
    version: item.version,
  })

  return respond(say(`Added ${item.name} to ${list.name}.`), list)
}

/** Backs both `RemoveItemIntent` (soft-deletes) and `CompleteItemIntent` (marks checked, via the
 * shared `completeItemRow`) — same fuzzy-match-before-mutate resolution, differing only in the
 * mutation applied once a matching active item is found. */
export async function handleRemoveOrComplete(
  token: AccessToken,
  slots: AlexaSlots,
  action: 'remove' | 'complete'
): Promise<IntentResult> {
  const itemName = slots.ItemName?.trim()
  if (!itemName) return respond(say("I didn't catch which item you meant."))

  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return respond(resolved.response)
  const list = resolved.list

  if (roleFor(token, list.id) !== 'editor') {
    return respond(say(`You only have view access to ${list.name}, so I can't change it.`), list)
  }

  const items = await activeItems(list.id)
  const match = closestMatch(itemName, items, (item) => item.name)
  if (!match) return respond(say(`I couldn't find ${itemName} on ${list.name}.`), list)

  if (action === 'remove') {
    match.deletedAt = DateTime.now()
    match.version += 1
    await match.save()

    await broadcastSync({
      listId: list.id,
      entityType: 'item',
      entityId: match.id,
      op: 'delete',
      version: match.version,
    })
    return respond(say(`Removed ${match.name} from ${list.name}.`), list)
  }

  await completeItemRow(list, match)
  return respond(say(`Marked ${match.name} as done on ${list.name}.`), list)
}

/** `ReadListIntent` — a spoken summary, not a full read of a long list (PHASE16_PLAN.md Stage 2).
 * Unlike the APL display (`apl_view.ts`, Stage 3), this only speaks unchecked items — the two
 * are deliberately allowed to diverge (see PHASE16_PLAN.md Stage 3's design note). */
export async function handleReadList(token: AccessToken, slots: AlexaSlots): Promise<IntentResult> {
  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return respond(resolved.response)
  const list = resolved.list

  const items = await Item.query()
    .where('listId', list.id)
    .whereNull('deletedAt')
    .where('checked', false)
    .orderBy('sortOrder', 'asc')

  if (items.length === 0) return respond(say(`${list.name} is empty.`), list)

  const maxSpoken = 5
  const spoken = items.slice(0, maxSpoken).map((item) => item.name)
  const remaining = items.length - spoken.length

  const summary =
    remaining > 0
      ? `On ${list.name}, you have ${spoken.join(', ')}, and ${remaining} more item${remaining === 1 ? '' : 's'}.`
      : `On ${list.name}, you have ${spoken.join(', ')}.`

  return respond(say(summary), list)
}

/**
 * Screen-aware `LaunchRequest` (PHASE16_PLAN.md Stage 3): resolves a list exactly the way
 * `ReadListIntent` with no `ListName` slot does (single accessible list used implicitly, several
 * asks to disambiguate), but always with a short greeting rather than the read-back summary —
 * the display itself, attached by `alexa_controller.ts` when the device has a screen, carries
 * the actual contents. Non-screen devices never call this; they keep the plain welcome message
 * `alexa_controller.ts` already had.
 */
export async function handleLaunchWithDisplay(token: AccessToken): Promise<IntentResult> {
  const resolved = await resolveListOrRespond(token, undefined)
  if ('response' in resolved) return respond(resolved.response)
  const list = resolved.list

  return respond(say(`Here's ${list.name}.`), list)
}
