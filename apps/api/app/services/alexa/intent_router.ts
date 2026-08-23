import Item from '#models/item'
import type List from '#models/list'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'
import { suggestCategoryId } from '#services/category_suggestion_service'
import { broadcastSync } from '#services/sync_broadcaster'
import { closestMatch } from '#services/alexa/fuzzy_match'
import { resolveList, roleFor } from '#services/alexa/list_resolution'
import { say } from '#services/alexa/response_builder'

type AlexaSlots = Record<string, string | undefined>

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

function speakAmbiguousLists(options: List[]): ReturnType<typeof say> {
  const names = options.map((list) => list.name).join(', ')
  return say(`Which list did you mean: ${names}?`, { reprompt: 'Which list did you mean?' })
}

async function resolveListOrRespond(
  token: AccessToken,
  listNameSlot: string | undefined
): Promise<{ list: List } | { response: ReturnType<typeof say> }> {
  const resolution = await resolveList(token, listNameSlot)
  if (resolution.kind === 'found') return { list: resolution.list }
  if (resolution.kind === 'ambiguous') return { response: speakAmbiguousLists(resolution.options) }
  return { response: say("I couldn't find that list.") }
}

/**
 * `AddItemIntent` — fuzzy-matches the spoken name against the list's existing item names first
 * (catching near-miss transcriptions like "miilk" vs "milk", per PHASE16_PLAN.md Stage 2) before
 * falling back to the API's own exact-match dedup/restore behavior that `items_controller.ts`'s
 * `store()` already implements; re-adding a checked or deleted item's name there restores it
 * rather than creating a metadata-less duplicate, so it's reused wholesale here instead of
 * reimplemented.
 */
export async function handleAddItem(token: AccessToken, slots: AlexaSlots) {
  const itemName = slots.ItemName?.trim()
  if (!itemName) return say("I didn't catch what to add.")

  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return resolved.response
  const list = resolved.list

  if (roleFor(token, list.id) !== 'editor') {
    return say(`You only have view access to ${list.name}, so I can't add to it.`)
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
    return say(`${existing.name} is already on ${list.name}.`)
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
    return say(`Added ${deletedMatch.name} to ${list.name}.`)
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

  return say(`Added ${item.name} to ${list.name}.`)
}

/** Backs both `RemoveItemIntent` (soft-deletes) and `CompleteItemIntent` (marks checked) — same
 * fuzzy-match-before-mutate resolution, differing only in the mutation applied once a matching
 * active item is found. */
export async function handleRemoveOrComplete(
  token: AccessToken,
  slots: AlexaSlots,
  action: 'remove' | 'complete'
) {
  const itemName = slots.ItemName?.trim()
  if (!itemName) return say("I didn't catch which item you meant.")

  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return resolved.response
  const list = resolved.list

  if (roleFor(token, list.id) !== 'editor') {
    return say(`You only have view access to ${list.name}, so I can't change it.`)
  }

  const items = await activeItems(list.id)
  const match = closestMatch(itemName, items, (item) => item.name)
  if (!match) return say(`I couldn't find ${itemName} on ${list.name}.`)

  match.version += 1
  if (action === 'remove') {
    match.deletedAt = DateTime.now()
  } else {
    match.checked = true
    match.checkedAt = DateTime.now()
  }
  await match.save()

  await broadcastSync({
    listId: list.id,
    entityType: 'item',
    entityId: match.id,
    op: action === 'remove' ? 'delete' : 'update',
    version: match.version,
  })

  return say(
    action === 'remove'
      ? `Removed ${match.name} from ${list.name}.`
      : `Marked ${match.name} as done on ${list.name}.`
  )
}

/** `ReadListIntent` — a spoken summary, not a full read of a long list (PHASE16_PLAN.md Stage 2). */
export async function handleReadList(token: AccessToken, slots: AlexaSlots) {
  const resolved = await resolveListOrRespond(token, slots.ListName)
  if ('response' in resolved) return resolved.response
  const list = resolved.list

  const items = await Item.query()
    .where('listId', list.id)
    .whereNull('deletedAt')
    .where('checked', false)
    .orderBy('sortOrder', 'asc')

  if (items.length === 0) return say(`${list.name} is empty.`)

  const maxSpoken = 5
  const spoken = items.slice(0, maxSpoken).map((item) => item.name)
  const remaining = items.length - spoken.length

  const summary =
    remaining > 0
      ? `On ${list.name}, you have ${spoken.join(', ')}, and ${remaining} more item${remaining === 1 ? '' : 's'}.`
      : `On ${list.name}, you have ${spoken.join(', ')}.`

  return say(summary)
}
