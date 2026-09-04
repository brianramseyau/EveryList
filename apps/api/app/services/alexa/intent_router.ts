import Item from '#models/item'
import type List from '#models/list'
import AlexaPreference from '#models/alexa_preference'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import { suggestCategoryId } from '#services/category_suggestion_service'
import { broadcastSync } from '#services/sync_broadcaster'
import { closestMatch } from '#services/alexa/fuzzy_match'
import { resolveList, roleFor, setDefaultList } from '#services/alexa/list_resolution'
import { say, type AlexaResponse } from '#services/alexa/response_builder'
import {
  hasCapacityFor,
  limitReachedMessage,
  limitReachedMessageForUncheck,
} from '#services/unchecked_limit'

type AlexaSlots = Record<string, string | undefined>

/**
 * Every intent handler's result: the spoken response, plus the list it acted on when one was
 * successfully resolved — `alexa_controller.ts` uses `list` to attach an APL display directive
 * for screen devices (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 3). `list` is omitted when there's nothing sensible
 * to show: a not-found/ambiguous list, or a request that never got far enough to resolve one
 * (e.g. no `ItemName` slot at all).
 */
export type IntentResult = { response: AlexaResponse; list?: List }

/** `uncheckItemRow`'s outcome — the touch handler speaks a refusal instead of the usual "marked
 * not done" when the list has no room (mirrors the checkbox's own limit gate). */
export type UncheckResult = { blocked: true; message: string } | { blocked: false }

function respond(response: AlexaResponse, list?: List): IntentResult {
  return list ? { response, list } : { response }
}

function toTitleCase(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
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

  logger.debug(
    { listNameSlot, kind: resolution.kind },
    'Alexa list resolution did not find one list'
  )
  if (resolution.kind === 'ambiguous') return { response: speakAmbiguousLists(resolution.options) }
  return { response: say("I couldn't find that list.") }
}

/**
 * Marks an active item done — the shared mutation behind both the voice `CompleteItemIntent`
 * path below and the touch-driven completion path (`apl_touch_handler.ts`, PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md
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
 * on-screen (`apl_touch_handler.ts`, PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 3). There's no voice equivalent (no
 * `UncheckItemIntent` exists; the closest voice path is re-saying an item's name via
 * `handleAddItem`, which restores it as a side effect of its own dedup logic) — this only exists
 * for the tap gesture, so it lives here as its own function rather than folded into that.
 */
export async function uncheckItemRow(list: List, item: Item): Promise<UncheckResult> {
  // Gated the same as every other uncheck path (2026-09-03 revision, from manual
  // testing): unchecking turns an invisible (checked) row back into an open one,
  // so it's refused when the list has no room.
  if (!(await hasCapacityFor(list))) {
    return { blocked: true, message: limitReachedMessageForUncheck(list) }
  }

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
  return { blocked: false }
}

/**
 * `AddItemIntent` — fuzzy-matches the spoken name against the list's existing item names first
 * (catching near-miss transcriptions like "miilk" vs "milk", per PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2) before
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
    logger.debug({ listId: list.id }, 'Alexa add-item denied: token only grants viewer access')
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
      // Re-speaking a checked item's name unchecks it — gated the same as the
      // checkbox (2026-09-03 revision), so it can't bypass its limit.
      if (!(await hasCapacityFor(list))) {
        return respond(say(limitReachedMessageForUncheck(list)), list)
      }
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
    // Restoring brings an invisible item back as unchecked — intake, so the
    // open-item limit gates it here like every other path.
    if (!(await hasCapacityFor(list))) {
      return respond(say(limitReachedMessage(list)), list)
    }
    deletedMatch.deletedAt = null
    deletedMatch.checked = false
    deletedMatch.checkedAt = null
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

  // The fresh-create branch is intake, so the open-item limit gates it here too.
  if (!(await hasCapacityFor(list))) {
    return respond(say(limitReachedMessage(list)), list)
  }

  const item = await Item.create({
    listId: list.id,
    name: toTitleCase(itemName),
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
    logger.debug({ listId: list.id }, 'Alexa item mutation denied: token only grants viewer access')
    return respond(say(`You only have view access to ${list.name}, so I can't change it.`), list)
  }

  const items = await activeItems(list.id)
  const match = closestMatch(itemName, items, (item) => item.name)
  if (!match) {
    logger.debug(
      { listId: list.id, itemName, action, activeItemCount: items.length },
      'Alexa item fuzzy-match found no candidate'
    )
    return respond(say(`I couldn't find ${itemName} on ${list.name}.`), list)
  }

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

/** `ReadListIntent` — a spoken summary, not a full read of a long list (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 2).
 * Unlike the APL display (`apl_view.ts`, Stage 3), this only speaks unchecked items — the two
 * are deliberately allowed to diverge (see PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 3's design note). */
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
 * `SetDefaultListIntent` — always requires a spoken `ListName`; unlike the other intents, falling
 * through to `resolveList`'s own no-slot handling here would just silently reuse whatever default
 * is already set (or ask to disambiguate) instead of prompting for the list being *changed to*.
 */
export async function handleSetDefaultList(
  token: AccessToken,
  slots: AlexaSlots
): Promise<IntentResult> {
  const listNameSlot = slots.ListName?.trim()
  if (!listNameSlot) {
    return respond(say("Tell me which list, like 'set groceries as my default list.'"))
  }

  const resolved = await resolveListOrRespond(token, listNameSlot)
  if ('response' in resolved) return respond(resolved.response)
  const list = resolved.list

  await setDefaultList(token, list.id)
  return respond(say(`Okay, ${list.name} is now your default list.`), list)
}

/**
 * `ShowCheckedItemsIntent`/`HideCheckedItemsIntent` — flips `AlexaPreference.showChecked`, a
 * global per-user preference (not scoped to any one list) that also gates whether the APL display
 * includes checked items at all — the same field an on-screen tap toggles
 * (`apl_touch_handler.ts`'s `toggleShowChecked` action). Unlike `handleSetDefaultList`, this never
 * asks "which list did you mean": with more than one accessible list, resolving one to refresh
 * would be guessing at something the request never named, so the display simply isn't attached —
 * it catches up on the next launch, read, or tap.
 */
export async function handleSetShowChecked(
  token: AccessToken,
  show: boolean
): Promise<IntentResult> {
  const userId = Number(token.tokenableId)
  await AlexaPreference.updateOrCreate({ userId }, { userId, showChecked: show })

  const resolution = await resolveList(token, undefined)
  const list = resolution.kind === 'found' ? resolution.list : undefined
  return respond(say(show ? 'Okay, showing checked items.' : 'Okay, hiding checked items.'), list)
}

/**
 * Screen-aware `LaunchRequest` (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 3): resolves a list exactly the way
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
