import webpush from 'web-push'
import logger from '@adonisjs/core/services/logger'
import PushSetting from '#models/push_setting'
import type PushSubscription from '#models/push_subscription'

export interface DeadlinePushPayload {
  title: string
  body: string
  itemId: number
  listId: number
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
  webpush.setVapidDetails(
    'mailto:admin@localhost',
    settings.vapidPublicKey,
    settings.vapidPrivateKey
  )

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
