import AlexaPreference from '#models/alexa_preference'
import ListPolicy from '#policies/list_policy'
import { updateAlexaPreferenceValidator } from '#validators/alexa_preference'
import type { HttpContext } from '@adonisjs/core/http'

/** The signed-in user's Alexa skill preferences, readable/writable from Settings → Alexa in the
 *  web app — normal session auth (`middleware.auth()`), scoped to `auth.getUserOrFail()` and
 *  never taking a user id param, unlike `services/alexa/*`'s own PAT-authenticated reads/writes
 *  of the same `alexa_preferences` row. */
export default class AlexaPreferencesController {
  async show({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const preference = await AlexaPreference.findBy('userId', user.id)

    return serialize({
      defaultListId: preference?.defaultListId ?? null,
      showChecked: preference?.showChecked ?? true,
    })
  }

  async update({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(updateAlexaPreferenceValidator)

    // A user can only point their default list at one they can actually see — otherwise this
    // endpoint could be used to probe list ids by observing whether the write is accepted.
    if (payload.defaultListId !== undefined && payload.defaultListId !== null) {
      await ListPolicy.requireList(user, payload.defaultListId, 'viewer')
    }

    const preference = await AlexaPreference.updateOrCreate(
      { userId: user.id },
      { userId: user.id, ...payload }
    )

    return serialize({
      defaultListId: preference.defaultListId,
      showChecked: preference.showChecked,
    })
  }
}
