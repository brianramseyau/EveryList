import type { HttpContext } from '@adonisjs/core/http'
import PushSetting from '#models/push_setting'
import PushSubscription from '#models/push_subscription'
import { subscribePushValidator } from '#validators/push_subscription'

export default class PushSubscriptionsController {
  /** Public — the PWA needs this before the user is necessarily authenticated
   * on this device, to build the `pushManager.subscribe()` call. */
  async publicKey({ response }: HttpContext) {
    const settings = await PushSetting.current()
    return response.ok({ data: { publicKey: settings.vapidPublicKey } })
  }

  async store({ auth, request, response, logger }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(subscribePushValidator)

    const subscription = await PushSubscription.updateOrCreate(
      { endpoint: payload.endpoint },
      {
        userId: user.id,
        endpoint: payload.endpoint,
        p256Dh: payload.p256dh,
        auth: payload.auth,
      }
    )

    logger.debug({ userId: user.id, subscriptionId: subscription.id }, 'push subscription saved')

    return response.created({ data: { id: subscription.id } })
  }

  /** Scoped to the authenticated user's own subscriptions — a device can only
   * unsubscribe itself, not any subscription id it happens to guess. */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    await PushSubscription.query().where('id', params.id).where('userId', user.id).delete()

    return response.noContent()
  }
}
