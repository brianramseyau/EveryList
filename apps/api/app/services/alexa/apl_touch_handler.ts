import Item from '#models/item'
import List from '#models/list'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { roleFor } from '#services/alexa/list_resolution'
import { completeItemRow, type IntentResult } from '#services/alexa/intent_router'
import { say } from '#services/alexa/response_builder'

/**
 * Handles an `Alexa.Presentation.APL.UserEvent` fired by tapping an item on-screen
 * (PHASE16_PLAN.md Stage 3) — `apl_document.ts`'s `onPress` command sends
 * `["complete", itemId, listId]` as the request's `arguments`. Mutates by id directly (no fuzzy
 * name matching needed, unlike the voice path in `intent_router.ts`) but still enforces the same
 * `editor`-role check `roleFor()` does for voice mutations — a viewer-scoped token's tap is
 * rejected the same way its voice command would be.
 */
export async function handleTouchEvent(token: AccessToken, args: unknown[]): Promise<IntentResult> {
  const [action, rawItemId, rawListId] = args
  if (action !== 'complete') {
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

  await completeItemRow(list, item)
  return { response: say(`Marked ${item.name} as done.`), list }
}
