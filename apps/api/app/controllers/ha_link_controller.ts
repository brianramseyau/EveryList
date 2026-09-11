import UserHassLink from '#models/user_hass_link'
import { getValidatedRemoteUser, isGenuineIngressRequest } from '#services/ingress_service'
import { supervisorAuthClient } from '#services/supervisor_auth_client'
import { updateUserHassLinkValidator } from '#validators/user_hass_link'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * The signed-in user's own Home Assistant account link, readable/writable from Settings → Home
 * Assistant in the web app — normal session auth (`middleware.auth()`), same shape as
 * `alexa_preferences_controller.ts`. See PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md.
 */
export default class HaLinkController {
  async show({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const link = await UserHassLink.findBy('userId', user.id)
    const detected = getValidatedRemoteUser(request)

    return serialize({
      linkedHaUsername: link?.haUsername ?? null,
      detectedHaUsername: detected?.username ?? null,
      detectedHaDisplayName: detected?.displayName ?? null,
    })
  }

  async update({ auth, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const { haUsername, password } = await request.validateUsing(updateUserHassLinkValidator)
    const detected = getValidatedRemoteUser(request)

    if (haUsername === null) {
      await UserHassLink.query().where('userId', user.id).delete()
      return serialize({
        linkedHaUsername: null,
        detectedHaUsername: detected?.username ?? null,
        detectedHaDisplayName: detected?.displayName ?? null,
      })
    }

    // Linking with no proof at all would let anyone claim any Home Assistant username — including
    // one a real HA user actually has — and, since implicit sign-in (ha_auth_controller.ts) looks
    // up accounts purely by that username, silently receive that real user's future auto-logins
    // into the squatter's own EveryList account instead. The one-click path already has proof
    // (Supervisor itself just told us the caller *is* this HA user, `getValidatedRemoteUser`); any
    // other username requires proving it the other way, the same password check the explicit
    // sign-in endpoint uses.
    if (haUsername !== detected?.username) {
      // Without this, an authenticated EveryList user (not just an Ingress visitor) could hammer
      // this branch from anywhere the server is reachable — including the add-on's optional
      // direct port — as an unthrottled credential-verification oracle against real Home
      // Assistant accounts. The explicit sign-in endpoint already requires this same check.
      if (!isGenuineIngressRequest(request)) {
        return response.forbidden({
          message: 'Linking a Home Assistant account is only available through the Ingress panel.',
        })
      }
      if (!password) {
        return response.badRequest({
          message: 'Enter that Home Assistant account’s password to link it.',
        })
      }
      let valid: boolean
      try {
        valid = await supervisorAuthClient.validateCredentials(haUsername, password)
      } catch {
        return response
          .status(503)
          .send({ message: 'Home Assistant sign-in is not available right now.' })
      }
      if (!valid) {
        return response.unauthorized({ message: 'Invalid Home Assistant username or password.' })
      }
    }

    const takenByAnotherUser = await UserHassLink.query()
      .where('haUsername', haUsername)
      .whereNot('userId', user.id)
      .first()
    if (takenByAnotherUser) {
      return response.badRequest({
        message: 'That Home Assistant account is already linked to a different EveryList account.',
      })
    }

    const link = await UserHassLink.updateOrCreate(
      { userId: user.id },
      { userId: user.id, haUsername }
    )

    return serialize({
      linkedHaUsername: link.haUsername,
      detectedHaUsername: detected?.username ?? null,
      detectedHaDisplayName: detected?.displayName ?? null,
    })
  }
}
