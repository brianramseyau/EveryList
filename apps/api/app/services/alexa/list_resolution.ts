import List from '#models/list'
import AlexaPreference from '#models/alexa_preference'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import type { ListRole } from '#models/list_member'
import { closestMatch } from '#services/alexa/fuzzy_match'

/** Parses a PAT's `list:<id>:<role>` abilities into `{listId, role}` pairs — same encoding
 * `personal_access_tokens_controller.ts`'s `decodeGrants` reads, kept as a separate small copy
 * here since Alexa's account-linking token is minted from a different flow (see
 * `alexa_oauth_controller.ts`) that has no reason to depend on that controller. */
function grantedListIds(token: AccessToken): number[] {
  return token.abilities
    .map((ability) => ability.split(':'))
    .filter(([kind, , role]) => kind === 'list' && (role === 'editor' || role === 'viewer'))
    .map(([, id]) => Number(id))
}

export type ListResolution =
  { kind: 'found'; list: List } | { kind: 'ambiguous'; options: List[] } | { kind: 'not-found' }

/**
 * Resolves which list an Alexa request should act on (PHASE16_PLAN.md Stage 2's "Which list"
 * section) — this logic is Alexa-specific and exists nowhere else in the app. An explicit
 * `ListName` slot is fuzzy-matched against the token's accessible lists; with no slot, a single
 * accessible list is used implicitly, and more than one asks the user to disambiguate rather
 * than guessing.
 */
export async function resolveList(
  token: AccessToken,
  listNameSlot: string | undefined
): Promise<ListResolution> {
  const listIds = grantedListIds(token)
  if (listIds.length === 0) return { kind: 'not-found' }

  const accessible = await List.query().whereIn('id', listIds).whereNull('deletedAt')
  if (accessible.length === 0) return { kind: 'not-found' }

  if (listNameSlot) {
    const match = closestMatch(listNameSlot, accessible, (list) => list.name)
    return match ? { kind: 'found', list: match } : { kind: 'not-found' }
  }

  if (accessible.length === 1) return { kind: 'found', list: accessible[0]! }

  const preference = await AlexaPreference.findBy('userId', Number(token.tokenableId))
  const defaultList = preference && accessible.find((list) => list.id === preference.defaultListId)
  if (defaultList) return { kind: 'found', list: defaultList }

  return { kind: 'ambiguous', options: accessible }
}

/**
 * `SetDefaultListIntent` — upserts the user's Alexa default list, used above
 * to resolve a request that names no list once there's more than one
 * accessible (rather than always asking "which list did you mean?").
 */
export async function setDefaultList(token: AccessToken, listId: number): Promise<void> {
  const userId = Number(token.tokenableId)
  await AlexaPreference.updateOrCreate({ userId }, { userId, defaultListId: listId })
}

/** The role (never exceeding what the token itself grants for `listId`) an Alexa request may act
 * with — mirrors `ListPolicy.effectiveRole`'s PAT reduction, applied here without the membership
 * lookup ListPolicy does, since we already trust the token's grant is the ceiling. */
export function roleFor(token: AccessToken, listId: number): ListRole | null {
  for (const ability of token.abilities) {
    const [kind, id, role] = ability.split(':')
    if (kind === 'list' && Number(id) === listId && (role === 'editor' || role === 'viewer')) {
      return role
    }
  }
  return null
}
