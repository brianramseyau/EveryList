import User from '#models/user'
import UserHassLink from '#models/user_hass_link'
import UserTransformer from '#transformers/user_transformer'
import { getValidatedRemoteUser, isGenuineIngressRequest } from '#services/ingress_service'
import { supervisorAuthClient } from '#services/supervisor_auth_client'
import { haLoginValidator } from '#validators/ha_auth'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Two Home-Assistant-backed sign-in paths, both scoped to viewing EveryList through the HA
 * add-on's Ingress panel (see PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md) and both requiring a row in
 * `user_hass_links` already exist (created via `ha_link_controller.ts`, either one-click from a
 * detected identity or manually) — neither endpoint creates one itself, since neither has an
 * authenticated EveryList session to attach a new link to:
 *   - `loginImplicit` — silent, no form: Supervisor already told us who's looking at the page
 *     (`getValidatedRemoteUser`); if that HA username is linked, sign in with no prompt at all.
 *   - `login` — explicit username/password, validated against HA's real accounts via Supervisor's
 *     `auth_api` (`supervisor_auth_client.ts`) — for a shared/kiosk browser where the HA session
 *     belongs to someone other than the EveryList account being signed into.
 * Both mint a token exactly like `AccessTokensController#store`.
 */
export default class HaAuthController {
  async #mintTokenFor(user: User, { response, serialize, logger }: HttpContext) {
    if (user.disabledAt) {
      logger.warn({ userId: user.id }, 'HA login denied: account disabled')
      return response.forbidden({ message: 'This account has been disabled.' })
    }

    const token = await User.accessTokens.create(user)
    logger.debug({ userId: user.id }, 'HA login succeeded')

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }

  async loginImplicit(ctx: HttpContext) {
    const { request, response } = ctx
    const remoteUser = getValidatedRemoteUser(request)
    if (!remoteUser) {
      return response.unauthorized({ message: 'No Home Assistant identity detected.' })
    }

    const link = await UserHassLink.findBy('haUsername', remoteUser.username)
    if (!link) {
      return response.notFound({ message: 'not_linked' })
    }

    const user = await User.findOrFail(link.userId)
    return this.#mintTokenFor(user, ctx)
  }

  async login(ctx: HttpContext) {
    const { request, response, logger } = ctx
    if (!isGenuineIngressRequest(request)) {
      // Both PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md and DOCS.md scope this to Ingress only —
      // without this check, this endpoint (a credential-validation oracle against the user's real
      // Home Assistant password) would be reachable from anywhere the server itself is, not just
      // through Home Assistant.
      return response.forbidden({
        message: 'Home Assistant sign-in is only available through the Ingress panel.',
      })
    }

    const { username, password } = await request.validateUsing(haLoginValidator)

    let valid: boolean
    try {
      valid = await supervisorAuthClient.validateCredentials(username, password)
    } catch (error) {
      logger.warn({ err: error }, 'Supervisor auth_api unavailable')
      return response
        .status(503)
        .send({ message: 'Home Assistant sign-in is not available right now.' })
    }

    if (!valid) {
      logger.warn({ username }, 'HA login denied: invalid Home Assistant credentials')
      return response.unauthorized({ message: 'Invalid Home Assistant username or password.' })
    }

    const link = await UserHassLink.findBy('haUsername', username)
    if (!link) {
      return response.notFound({
        message: 'Sign in normally and link your Home Assistant account from Settings first.',
      })
    }

    const user = await User.findOrFail(link.userId)
    return this.#mintTokenFor(user, ctx)
  }
}
