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

    // A push subscription's endpoint is inherently device-scoped, not user-scoped — the
    // Web Push spec guarantees it's globally unique. If it already belongs to a *different*
    // user (a shared device where someone else previously signed in and subscribed), that
    // old row is deleted rather than silently reassigned in place, so the handoff is explicit
    // and logged instead of looking like an in-place update.
    const existing = await PushSubscription.findBy('endpoint', payload.endpoint)
    if (existing && existing.userId !== user.id) {
      logger.warn(
        { previousUserId: existing.userId, userId: user.id, subscriptionId: existing.id },
        'push subscription endpoint reassigned to a different user'
      )
      await existing.delete()
    }

    const subscription = existing?.userId === user.id ? existing : new PushSubscription()
    subscription.merge({
      userId: user.id,
      endpoint: payload.endpoint,
      p256Dh: payload.p256dh,
      auth: payload.auth,
    })
    await subscription.save()

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
