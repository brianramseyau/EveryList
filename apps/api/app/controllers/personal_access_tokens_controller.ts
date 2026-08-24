import User from '#models/user'
import ListPolicy from '#policies/list_policy'
import {
  createPersonalAccessTokenValidator,
  updatePersonalAccessTokenValidator,
} from '#validators/personal_access_token'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import PersonalAccessTokenTransformer, {
  type PersonalAccessTokenView,
} from '#transformers/personal_access_token_transformer'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import type { ListRole } from '#models/list_member'

/**
 * Decodes a PAT's `list:<id>:<role>` abilities — one per granted list,
 * written verbatim by `store` below (the only place this app ever mints
 * one) — trusted to be well-formed rather than defensively re-validated.
 */
function decodeGrants(token: AccessToken): { listId: number; role: ListRole }[] {
  return token.abilities.map((ability) => {
    const [, id, role] = ability.split(':')
    return { listId: Number(id), role: role as ListRole }
  })
}

function toView(token: AccessToken): PersonalAccessTokenView {
  return {
    id: token.identifier,
    name: token.name,
    grants: decodeGrants(token),
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
  }
}

export default class PersonalAccessTokensController {
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const tokens = await User.personalAccessTokens.all(user)

    return serialize(PersonalAccessTokenTransformer.transform(tokens.map(toView)))
  }

  /** Mints a token scoped to every list in `listIds` — minting requires being an owner of all of them. */
  async store({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createPersonalAccessTokenValidator)
    const listIds = [...new Set(payload.listIds)]

    const lists = await Promise.all(
      listIds.map((listId) => ListPolicy.requireList(user, listId, 'owner'))
    )

    const abilities = lists.map((list) => `list:${list.id}:${payload.role}`)
    const token = await User.personalAccessTokens.create(user, abilities, { name: payload.name })
    const view = toView(token)

    logger.debug(
      { userId: user.id, tokenId: token.identifier, listIds, role: payload.role },
      'created personal access token'
    )

    // The plaintext value only ever exists here — DbAccessTokensProvider
    // never persists it, only its hash, so there's nothing to "hide later"
    // on subsequent `index` reads.
    return response.created({ data: { ...view, token: token.value!.release() } })
  }

  /**
   * Self-introspection for the token that authenticated this request — the
   * only way an external client (Home Assistant, Alexa) can discover which
   * lists it was granted without the user re-entering the same list IDs a
   * second time in that integration's own setup flow. PAT-only (see
   * routes.ts): a login session has no per-list "grant" to report — it has
   * full membership-derived access, a different concept `decodeGrants`
   * isn't meant to represent.
   */
  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    return response.ok({ data: toView(user.currentAccessToken!) })
  }

  /**
   * Replaces a token's grants (and optionally its name) in place, preserving
   * its id/hash so integrations holding the plaintext value don't need to
   * re-mint — DbAccessTokensProvider only exposes create/find/delete, so this
   * writes the `abilities` column directly rather than going through it.
   */
  async update({ auth, params, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const existing = await User.personalAccessTokens.find(user, params.tokenId)
    if (!existing) {
      return response.notFound({ message: 'Token not found' })
    }

    const payload = await request.validateUsing(updatePersonalAccessTokenValidator)
    const listIds = [...new Set(payload.listIds)]

    const lists = await Promise.all(
      listIds.map((listId) => ListPolicy.requireList(user, listId, 'owner'))
    )

    const abilities = lists.map((list) => `list:${list.id}:${payload.role}`)

    await db
      .from('auth_access_tokens')
      .where('id', params.tokenId)
      .where('tokenable_id', user.id)
      .where('type', 'pat')
      .update({
        name: payload.name ?? existing.name,
        abilities: JSON.stringify(abilities),
        updated_at: new Date(),
      })

    logger.debug(
      { userId: user.id, tokenId: params.tokenId, listIds, role: payload.role },
      'updated personal access token grants'
    )

    const updated = await User.personalAccessTokens.find(user, params.tokenId)
    return response.ok({ data: toView(updated!) })
  }

  async destroy({ auth, params, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const token = await User.personalAccessTokens.find(user, params.tokenId)
    if (!token) {
      return response.notFound({ message: 'Token not found' })
    }

    await User.personalAccessTokens.delete(user, params.tokenId)
    logger.debug({ userId: user.id, tokenId: params.tokenId }, 'revoked personal access token')
    return response.noContent()
  }
}
