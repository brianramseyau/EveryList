import type { AccessToken } from '@adonisjs/auth/access_tokens'
import logger from '@adonisjs/core/services/logger'
import type List from '#models/list'
import AlexaPreference from '#models/alexa_preference'
import { accessibleLists } from '#services/alexa/list_resolution'

/** Alexa caps a dynamic entity type at 100 values per `Dialog.UpdateDynamicEntities` directive
 * — sending more is rejected outright, silently undoing list-name recognition for everyone on
 * the token rather than just the lists past the cap. No real household has anywhere near this
 * many lists; this exists so that ever happening fails loud (a log line) instead of a directive
 * Alexa quietly drops. */
const MAX_DYNAMIC_LIST_VALUES = 100

/** Puts the token's Alexa default list first, then sorts the rest by id (creation order) so that
 * if a token has more than `MAX_DYNAMIC_LIST_VALUES` accessible lists, truncation deterministically
 * drops the most-recently-created ones instead of an arbitrary, DB-order-dependent set — and never
 * drops the one list the user has told Alexa it asks for by name most often. There's no per-list
 * usage signal beyond that preference, so this is the best ordering available short of adding one. */
async function prioritized(token: AccessToken, lists: List[]): Promise<List[]> {
  if (lists.length <= MAX_DYNAMIC_LIST_VALUES) return lists

  const preference = await AlexaPreference.findBy('userId', Number(token.tokenableId))
  const sorted = [...lists].sort((a, b) => a.id - b.id)
  if (!preference) return sorted

  const defaultIndex = sorted.findIndex((list) => list.id === preference.defaultListId)
  if (defaultIndex === -1) return sorted

  const [defaultList] = sorted.splice(defaultIndex, 1)
  return [defaultList!, ...sorted]
}

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

  if (lists.length > MAX_DYNAMIC_LIST_VALUES) {
    logger.warn(
      { accessibleListCount: lists.length, cap: MAX_DYNAMIC_LIST_VALUES },
      'Alexa token has more accessible lists than the dynamic entities cap; truncating'
    )
  }

  const values = await prioritized(token, lists)

  return {
    type: 'Dialog.UpdateDynamicEntities',
    updateBehavior: 'REPLACE',
    types: [
      {
        name: 'ListNameType',
        values: values.slice(0, MAX_DYNAMIC_LIST_VALUES).map((list) => ({
          id: String(list.id),
          name: { value: list.name },
        })),
      },
    ],
  }
}
