import webpush from 'web-push'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import PushSetting from '#models/push_setting'
import type PushSubscription from '#models/push_subscription'

export interface DeadlinePushPayload {
  title: string
  body: string
  itemId: number
  listId: number
}

/**
 * The VAPID spec requires the subject to be a `mailto:` address or an `https:` URL — APP_URL
 * itself is often `http://` in local/self-hosted setups without a TLS-terminating reverse
 * proxy in front, so it can't be used directly. A `mailto:` built from APP_URL's own hostname
 * avoids both the protocol restriction and a hardcoded placeholder contact some push services
 * surface back to the subscriber.
 */
function vapidSubject(): string {
  const hostname = new URL(env.get('APP_URL')).hostname
  return `mailto:push@${hostname}`
}

/**
 * Sends one Web Push message to one subscription, using this instance's
 * lazily-generated VAPID keypair (`PushSetting.current()`). Deletes the
 * subscription row on a 404/410 — the browser's push service has confirmed
 * it's gone, so keeping it around would just fail identically forever.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: DeadlinePushPayload
): Promise<void> {
  const settings = await PushSetting.current()
  webpush.setVapidDetails(vapidSubject(), settings.vapidPublicKey, settings.vapidPrivateKey)

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256Dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    )
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await subscription.delete()
      return
    }
    logger.error({ err: error, subscriptionId: subscription.id }, 'failed to send web push')
    throw error
  }
}
