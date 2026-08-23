import Item from '#models/item'
import List from '#models/list'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { roleFor } from '#services/alexa/list_resolution'
import { completeItemRow, uncheckItemRow, type IntentResult } from '#services/alexa/intent_router'
import { say } from '#services/alexa/response_builder'

const ACTIONS = {
  complete: { mutate: completeItemRow, speak: (name: string) => `Marked ${name} as done.` },
  uncheck: { mutate: uncheckItemRow, speak: (name: string) => `Marked ${name} as not done.` },
} as const

/**
 * Handles an `Alexa.Presentation.APL.UserEvent` fired by tapping an item on-screen
 * (PHASE16_PLAN.md Stage 3) — `apl_document.ts`'s `onPress` command sends
 * `[action, itemId, listId]`, where `action` is `"complete"` or `"uncheck"` depending on the
 * tapped row's current `checked` state, so tapping the checkbox is a real toggle rather than a
 * one-way "mark done" (which would otherwise silently re-complete an already-checked item on a
 * second tap). Mutates by id directly (no fuzzy name matching needed, unlike the voice path in
 * `intent_router.ts`) but still enforces the same `editor`-role check `roleFor()` does for voice
 * mutations — a viewer-scoped token's tap is rejected the same way its voice command would be.
 */
export async function handleTouchEvent(token: AccessToken, args: unknown[]): Promise<IntentResult> {
  const [action, rawItemId, rawListId] = args
  if (action !== 'complete' && action !== 'uncheck') {
    return { response: say("Sorry, I didn't understand that.") }
  }

  const listId = Number(rawListId)
  if (roleFor(token, listId) !== 'editor') {
    return { response: say("You don't have permission to change that list.") }
  }

  const list = await List.query().where('id', listId).whereNull('deletedAt').first()
  if (!list) return { response: say("I couldn't find that list.") }

  const itemId = Number(rawItemId)
  const item = await Item.query()
    .where('id', itemId)
    .where('listId', list.id)
    .whereNull('deletedAt')
    .first()
  if (!item) return { response: say("I couldn't find that item."), list }

  const { mutate, speak } = ACTIONS[action]
  await mutate(list, item)
  return { response: say(speak(item.name)), list }
}
