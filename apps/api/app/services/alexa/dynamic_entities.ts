import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { accessibleLists } from '#services/alexa/list_resolution'

/**
 * Registers the token's actual list names as `ListNameType` slot values for the rest of the
 * skill session, via `Dialog.UpdateDynamicEntities` (see the "Alexa list-name recognition" fix:
 * the model's static `ListNameType` catalog only ever held a handful of authored examples like
 * "groceries" and "hardware" — a real list named e.g. "Costco" was never in it, so the NLU had
 * nothing to match against and folded the whole trailing phrase into `ItemName` instead).
 *
 * This only helps utterances *after* the one that triggered it — a session's opening one-shot
 * ("Alexa, ask EveryList to add tortillas to Costco") is resolved by Amazon's NLU before our
 * skill ever sees the request, so no directive we return can retroactively fix that specific
 * utterance. It does fix every subsequent turn in the same session (e.g. "Alexa, open EveryList"
 * followed by "add tortillas to Costco"), which is why this is attached to every response rather
 * than just `LaunchRequest`.
 */
export async function buildDynamicListEntitiesDirective(
  token: AccessToken
): Promise<Record<string, unknown> | undefined> {
  const lists = await accessibleLists(token)
  if (lists.length === 0) return undefined

  return {
    type: 'Dialog.UpdateDynamicEntities',
    updateBehavior: 'REPLACE',
    types: [
      {
        name: 'ListNameType',
        values: lists.map((list) => ({
          id: String(list.id),
          name: { value: list.name },
        })),
      },
    ],
  }
}
