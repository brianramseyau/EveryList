import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import webpush from 'web-push'
import User from '#models/user'
import PushSubscription from '#models/push_subscription'
import { sendPush } from '#services/push_service'

test.group('sendPush', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  const originalSendNotification = webpush.sendNotification

  group.each.teardown(() => {
    webpush.sendNotification = originalSendNotification
  })

  async function createUser(): Promise<User> {
    return User.create({
      fullName: 'Test User',
      email: `push-test-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'password123',
    })
  }

  test('sends the payload as JSON to the subscription endpoint', async ({ assert }) => {
    const user = await createUser()
    const subscription = await PushSubscription.create({
      userId: user.id,
      endpoint: 'https://push.example.com/device',
      p256Dh: 'p256dh-key',
      auth: 'auth-key',
    })

    let received: { endpoint: string; body: string } | null = null
    webpush.sendNotification = (async (target: unknown, body: unknown) => {
      received = { endpoint: (target as { endpoint: string }).endpoint, body: body as string }
      return { statusCode: 201, headers: {}, body: '' }
    }) as typeof webpush.sendNotification

    await sendPush(subscription, { title: 'Required by', body: 'Milk', itemId: 1, listId: 1 })

    assert.isNotNull(received)
    assert.equal(received!.endpoint, subscription.endpoint)
    assert.deepEqual(JSON.parse(received!.body), {
      title: 'Required by',
      body: 'Milk',
      itemId: 1,
      listId: 1,
    })
  })

  test('deletes the subscription on a 410 Gone response instead of throwing', async ({
    assert,
  }) => {
    const user = await createUser()
    const subscription = await PushSubscription.create({
      userId: user.id,
      endpoint: 'https://push.example.com/expired-device',
      p256Dh: 'p256dh-key',
      auth: 'auth-key',
    })

    webpush.sendNotification = (async () => {
      const error = new Error('Gone') as Error & { statusCode: number }
      error.statusCode = 410
      throw error
    }) as typeof webpush.sendNotification

    await sendPush(subscription, { title: 't', body: 'b', itemId: 1, listId: 1 })

    const remaining = await PushSubscription.find(subscription.id)
    assert.isNull(remaining)
  })

  test('rethrows on an unexpected failure without deleting the subscription', async ({
    assert,
  }) => {
    const user = await createUser()
    const subscription = await PushSubscription.create({
      userId: user.id,
      endpoint: 'https://push.example.com/flaky-device',
      p256Dh: 'p256dh-key',
      auth: 'auth-key',
    })

    webpush.sendNotification = (async () => {
      const error = new Error('server error') as Error & { statusCode: number }
      error.statusCode = 500
      throw error
    }) as typeof webpush.sendNotification

    await assert.rejects(() =>
      sendPush(subscription, { title: 't', body: 'b', itemId: 1, listId: 1 })
    )

    const remaining = await PushSubscription.find(subscription.id)
    assert.isNotNull(remaining)
  })
})
