import UserHassLink from '#models/user_hass_link'
import { getValidatedRemoteUser } from '#services/ingress_service'
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
    const { haUsername } = await request.validateUsing(updateUserHassLinkValidator)
    const detected = getValidatedRemoteUser(request)

    if (haUsername === null) {
      await UserHassLink.query().where('userId', user.id).delete()
      return serialize({
        linkedHaUsername: null,
        detectedHaUsername: detected?.username ?? null,
        detectedHaDisplayName: detected?.displayName ?? null,
      })
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
