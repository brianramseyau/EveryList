import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
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
    // and logged instead of looking like an in-place update. The read-decide-write sequence
    // runs inside a transaction so a failure partway (e.g. the create failing right after the
    // delete) rolls the whole thing back instead of orphaning the endpoint with neither the
    // old nor the new row surviving.
    const subscription = await db.transaction(async (trx) => {
      const existing = await PushSubscription.query({ client: trx })
        .where('endpoint', payload.endpoint)
        .first()

      if (existing && existing.userId !== user.id) {
        logger.warn(
          { previousUserId: existing.userId, userId: user.id, subscriptionId: existing.id },
          'push subscription endpoint reassigned to a different user'
        )
        await existing.useTransaction(trx).delete()
      }

      const row = existing?.userId === user.id ? existing : new PushSubscription()
      row.useTransaction(trx)
      row.merge({
        userId: user.id,
        endpoint: payload.endpoint,
        p256Dh: payload.p256dh,
        auth: payload.auth,
      })
      await row.save()
      return row
    })

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
