import Item from '#models/item'
import List from '#models/list'
import AlexaPreference from '#models/alexa_preference'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import logger from '@adonisjs/core/services/logger'
import { roleFor } from '#services/alexa/list_resolution'
import { completeItemRow, uncheckItemRow, type IntentResult } from '#services/alexa/intent_router'
import { say } from '#services/alexa/response_builder'

const ACTIONS = {
  complete: { mutate: completeItemRow, speak: (name: string) => `Marked ${name} as done.` },
  uncheck: { speak: (name: string) => `Marked ${name} as not done.` },
} as const

/**
 * Handles the on-screen "show/hide checked items" button — `apl_document.ts` sends
 * `["toggleShowChecked", null, listId]` through the same `onPress` path item taps use. Flips the
 * same `AlexaPreference.showChecked` field the `ShowCheckedItemsIntent`/`HideCheckedItemsIntent`
 * voice commands do (`intent_router.ts`'s `handleSetShowChecked`), so state stays consistent
 * whichever surface you use. Requires only that the token can see the list at all (`viewer` or
 * `editor`) — like `SetDefaultListIntent`, this is a personal display preference, not a mutation
 * to the list itself, so it needs no `editor` role.
 */
async function handleToggleShowChecked(
  token: AccessToken,
  rawListId: unknown
): Promise<IntentResult> {
  const listId = Number(rawListId)
  if (roleFor(token, listId) === null) {
    logger.debug({ listId }, 'Alexa APL touch event denied: token has no access to that list')
    return { response: say("You don't have permission to view that list.") }
  }

  const list = await List.query().where('id', listId).whereNull('deletedAt').first()
  if (!list) {
    logger.debug({ listId }, 'Alexa APL touch event: list not found')
    return { response: say("I couldn't find that list.") }
  }

  const userId = Number(token.tokenableId)
  const current = await AlexaPreference.findBy('userId', userId)
  const show = !(current?.showChecked ?? true)
  await AlexaPreference.updateOrCreate({ userId }, { userId, showChecked: show })

  return { response: say(show ? 'Showing checked items.' : 'Hiding checked items.'), list }
}

/**
 * Handles an `Alexa.Presentation.APL.UserEvent` fired by tapping an item on-screen
 * (PLAN_16_PHASE_VOICE_ASSISTANT_INTEGRATION.md Stage 3) — `apl_document.ts`'s `onPress` command sends
 * `[action, itemId, listId]`, where `action` is `"complete"` or `"uncheck"` depending on the
 * tapped row's current `checked` state, so tapping the checkbox is a real toggle rather than a
 * one-way "mark done" (which would otherwise silently re-complete an already-checked item on a
 * second tap). Mutates by id directly (no fuzzy name matching needed, unlike the voice path in
 * `intent_router.ts`) but still enforces the same `editor`-role check `roleFor()` does for voice
 * mutations — a viewer-scoped token's tap is rejected the same way its voice command would be.
 * `toggleShowChecked` (the show/hide-checked button) is handled separately above since it's not
 * an item mutation and needs no `itemId`.
 */
export async function handleTouchEvent(token: AccessToken, args: unknown[]): Promise<IntentResult> {
  const [action, rawItemId, rawListId] = args
  logger.debug({ action, rawItemId, rawListId }, 'Alexa APL touch event received')

  if (action === 'toggleShowChecked') {
    return handleToggleShowChecked(token, rawListId)
  }

  if (action !== 'complete' && action !== 'uncheck') {
    logger.warn({ action }, 'Alexa APL touch event named an unrecognized action')
    return { response: say("Sorry, I didn't understand that.") }
  }

  const listId = Number(rawListId)
  if (roleFor(token, listId) !== 'editor') {
    logger.debug({ listId }, 'Alexa APL touch event denied: token only grants viewer access')
    return { response: say("You don't have permission to change that list.") }
  }

  const list = await List.query().where('id', listId).whereNull('deletedAt').first()
  if (!list) {
    logger.debug({ listId }, 'Alexa APL touch event: list not found')
    return { response: say("I couldn't find that list.") }
  }

  const itemId = Number(rawItemId)
  const item = await Item.query()
    .where('id', itemId)
    .where('listId', list.id)
    .whereNull('deletedAt')
    .first()
  if (!item) {
    logger.debug({ listId, itemId }, 'Alexa APL touch event: item not found')
    return { response: say("I couldn't find that item."), list }
  }

  if (action === 'uncheck') {
    const result = await uncheckItemRow(list, item)
    if (result.blocked) return { response: say(result.message), list }
    return { response: say(ACTIONS.uncheck.speak(item.name)), list }
  }

  await ACTIONS.complete.mutate(list, item)
  return { response: say(ACTIONS.complete.speak(item.name)), list }
}
