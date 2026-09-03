import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import Item from '#models/item'
import ListMember from '#models/list_member'
import PushSubscription from '#models/push_subscription'
import DeadlineNotificationSend from '#models/deadline_notification_send'
import { sendPush } from '#services/push_service'

/** How late a check is still allowed to fire a datetime deadline's
 * notification — absorbs a scheduler restart/downtime blip (matches
 * `backup_service`'s tolerance philosophy) without retroactively notifying
 * for deadlines that were missed long ago. */
const GRACE_MINUTES = 15

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 'YYYY-MM-DD' for `now`'s local calendar day — mirrors apps/web's
 * `todayLocalIso`, using the server's own local clock (PLAN_26's chosen
 * timing reference). */
export function todayLocalIso(now: DateTime): string {
  return `${now.year}-${pad(now.month)}-${pad(now.day)}`
}

/** 'YYYY-MM-DDTHH:mm' for `now`'s local clock, minute precision. */
export function nowLocalMinuteIso(now: DateTime): string {
  return `${todayLocalIso(now)}T${pad(now.hour)}:${pad(now.minute)}`
}

function hasTime(deadline: string): boolean {
  return deadline.length > 10
}

/**
 * True exactly for the window a deadline's notification should fire in: a
 * datetime deadline is due from the minute it passes through
 * `GRACE_MINUTES` later; a date-only deadline is due for the whole of its
 * calendar day (deduped by `deadline_notification_sends`, so it still only
 * sends once).
 */
export function isNotificationDue(deadline: string, now: DateTime): boolean {
  if (hasTime(deadline)) {
    const nowIso = nowLocalMinuteIso(now)
    const windowStartIso = nowLocalMinuteIso(now.minus({ minutes: GRACE_MINUTES }))
    return deadline > windowStartIso && deadline <= nowIso
  }
  return deadline === todayLocalIso(now)
}

/**
 * Checked periodically by `start/deadline_notification_scheduler.ts`. Finds
 * every unchecked item with a due deadline on a list with `useDeadline` on,
 * and sends a Web Push notification to every list member's subscribed
 * devices that hasn't already been notified for that item (see
 * `deadline_notification_sends`).
 */
export async function sendDueDeadlineNotifications(now: DateTime = DateTime.now()): Promise<void> {
  const nowIso = nowLocalMinuteIso(now)

  const candidates = await Item.query()
    .whereNull('deletedAt')
    .where('checked', false)
    .whereNotNull('deadline')
    .where('deadline', '<=', nowIso)
    .whereHas('list', (query) => query.where('useDeadline', true))
    .preload('list')

  for (const item of candidates) {
    if (!isNotificationDue(item.deadline!, now)) continue

    const members = await ListMember.query().where('listId', item.listId).whereNotNull('acceptedAt')
    const userIds = members.map((member) => member.userId)

    const subscriptions = await PushSubscription.query().whereIn('userId', userIds)
    if (subscriptions.length === 0) continue

    const alreadySent = await DeadlineNotificationSend.query()
      .where('itemId', item.id)
      .whereIn(
        'pushSubscriptionId',
        subscriptions.map((subscription) => subscription.id)
      )
    const alreadySentIds = new Set(alreadySent.map((send) => send.pushSubscriptionId))

    for (const subscription of subscriptions) {
      if (alreadySentIds.has(subscription.id)) continue

      try {
        await sendPush(subscription, {
          title: 'Required by',
          body: item.name,
          itemId: item.id,
          listId: item.listId,
        })
        await DeadlineNotificationSend.create({
          itemId: item.id,
          pushSubscriptionId: subscription.id,
          sentAt: now,
        })
      } catch (error) {
        logger.error(
          { err: error, itemId: item.id, subscriptionId: subscription.id },
          'failed to send deadline notification'
        )
      }
    }
  }
}
