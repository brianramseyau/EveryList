import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import webpush from 'web-push'
import type { ListDto, ItemDto } from '@everylist/shared'
import PushSubscription from '#models/push_subscription'
import DeadlineNotificationSend from '#models/deadline_notification_send'
import { sendDueDeadlineNotifications } from '#services/deadline_notification_service'
import { bodyData, signupAndGetUser } from './helpers.js'

test.group('Deadline notifications', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  const originalSendNotification = webpush.sendNotification

  group.each.teardown(() => {
    webpush.sendNotification = originalSendNotification
  })

  test('sends once per subscription for a due item, then dedupes on the next check', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Return library book', deadline: '2026-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({
        endpoint: 'https://push.example.com/owner-device',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })

    const sent: unknown[] = []
    webpush.sendNotification = (async (subscription: unknown, payload: unknown) => {
      sent.push({ subscription, payload })
      return { statusCode: 201, headers: {}, body: '' }
    }) as typeof webpush.sendNotification

    const now = DateTime.fromISO('2026-01-01T09:05:00')
    await sendDueDeadlineNotifications(now)
    assert.lengthOf(sent, 1)

    const sends = await DeadlineNotificationSend.query().where('itemId', item.id)
    assert.lengthOf(sends, 1)

    // Second check within the same window must not double-send.
    await sendDueDeadlineNotifications(now)
    assert.lengthOf(sent, 1)
  })

  test('an item whose deadline has long since passed is not (re)notified', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Ancient deadline', deadline: '2020-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({
        endpoint: 'https://push.example.com/owner-device-ancient',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })

    const sent: unknown[] = []
    webpush.sendNotification = (async () => {
      sent.push(true)
      return { statusCode: 201, headers: {}, body: '' }
    }) as typeof webpush.sendNotification

    await sendDueDeadlineNotifications(DateTime.fromISO('2026-01-01T09:05:00'))
    assert.lengthOf(sent, 0)

    const sends = await DeadlineNotificationSend.query().where('itemId', item.id)
    assert.lengthOf(sends, 0)
  })

  test('a due item with no subscribed devices is skipped without error', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'No subscriber yet', deadline: '2026-01-01T09:00' })

    await assert.doesNotReject(() =>
      sendDueDeadlineNotifications(DateTime.fromISO('2026-01-01T09:05:00'))
    )
  })

  test('logs and continues past a subscription send failure instead of aborting the batch', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Flaky send', deadline: '2026-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({
        endpoint: 'https://push.example.com/owner-device-flaky',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })

    webpush.sendNotification = (async () => {
      throw new Error('network blip')
    }) as typeof webpush.sendNotification

    await sendDueDeadlineNotifications(DateTime.fromISO('2026-01-01T09:05:00'))

    const sends = await DeadlineNotificationSend.query().where('itemId', item.id)
    assert.lengthOf(sends, 0)
  })

  test('does not notify for a checked item or a list with useDeadline off', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Checked item', deadline: '2026-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    await client
      .patch(`/api/v1/lists/${list.id}/items/${item.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ checked: true })

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({
        endpoint: 'https://push.example.com/owner-device-2',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      })

    const sent: unknown[] = []
    webpush.sendNotification = (async () => {
      sent.push(true)
      return { statusCode: 201, headers: {}, body: '' }
    }) as typeof webpush.sendNotification

    await sendDueDeadlineNotifications(DateTime.fromISO('2026-01-01T09:05:00'))
    assert.lengthOf(sent, 0)
  })

  test('editing an item deadline clears its prior notification sends', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Pay rent', deadline: '2026-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    const subscription = await PushSubscription.create({
      userId: owner.id,
      endpoint: 'https://push.example.com/owner-device-3',
      p256Dh: 'p256dh-key',
      auth: 'auth-key',
    })
    await DeadlineNotificationSend.create({
      itemId: item.id,
      pushSubscriptionId: subscription.id,
      sentAt: DateTime.now(),
    })

    await client
      .patch(`/api/v1/lists/${list.id}/items/${item.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ deadline: '2026-01-02T09:00' })

    const remaining = await DeadlineNotificationSend.query().where('itemId', item.id)
    assert.lengthOf(remaining, 0)
  })

  test('leaves prior sends alone when an update does not touch the deadline', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Chores', useDeadline: true })
    const list = bodyData<ListDto>(listResponse)

    const itemResponse = await client
      .post(`/api/v1/lists/${list.id}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Pay rent', deadline: '2026-01-01T09:00' })
    const item = bodyData<ItemDto>(itemResponse)

    const subscription = await PushSubscription.create({
      userId: owner.id,
      endpoint: 'https://push.example.com/owner-device-4',
      p256Dh: 'p256dh-key',
      auth: 'auth-key',
    })
    await DeadlineNotificationSend.create({
      itemId: item.id,
      pushSubscriptionId: subscription.id,
      sentAt: DateTime.now(),
    })

    await client
      .patch(`/api/v1/lists/${list.id}/items/${item.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ notes: 'still due same time' })

    const remaining = await DeadlineNotificationSend.query().where('itemId', item.id)
    assert.lengthOf(remaining, 1)
  })
})
