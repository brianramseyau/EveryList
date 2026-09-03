import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PushSubscription from '#models/push_subscription'
import { bodyData, signupAndGetUser } from './helpers.js'

test.group('Push subscriptions', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('public-key requires no authentication and returns a stable key', async ({
    client,
    assert,
  }) => {
    const first = await client.get('/api/v1/push/public-key')
    first.assertStatus(200)
    const { publicKey } = bodyData<{ publicKey: string }>(first)
    assert.isString(publicKey)
    assert.isAbove(publicKey.length, 0)

    const second = await client.get('/api/v1/push/public-key')
    assert.equal(bodyData<{ publicKey: string }>(second).publicKey, publicKey)
  })

  test('subscribe/unsubscribe require authentication', async ({ client }) => {
    const subscribe = await client.post('/api/v1/push/subscriptions').json({
      endpoint: 'https://push.example.com/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
    subscribe.assertStatus(401)

    const unsubscribe = await client.delete('/api/v1/push/subscriptions/1')
    unsubscribe.assertStatus(401)
  })

  test('subscribes, then unsubscribes, a device', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    const endpoint = 'https://push.example.com/device-1'

    const subscribe = await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ endpoint, p256dh: 'p256dh-key', auth: 'auth-key' })
    subscribe.assertStatus(201)
    const { id } = bodyData<{ id: number }>(subscribe)

    const stored = await PushSubscription.query().where('endpoint', endpoint).firstOrFail()
    assert.equal(stored.userId, user.id)
    assert.equal(stored.p256Dh, 'p256dh-key')

    const unsubscribe = await client
      .delete(`/api/v1/push/subscriptions/${id}`)
      .header('Authorization', `Bearer ${user.token}`)
    unsubscribe.assertStatus(204)

    const remaining = await PushSubscription.query().where('endpoint', endpoint).first()
    assert.isNull(remaining)
  })

  test("cannot unsubscribe another user's device", async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const stranger = await signupAndGetUser(client)
    const endpoint = 'https://push.example.com/device-owner'

    const subscribe = await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ endpoint, p256dh: 'p256dh-key', auth: 'auth-key' })
    const { id } = bodyData<{ id: number }>(subscribe)

    const unsubscribe = await client
      .delete(`/api/v1/push/subscriptions/${id}`)
      .header('Authorization', `Bearer ${stranger.token}`)
    unsubscribe.assertStatus(204)

    const remaining = await PushSubscription.query().where('id', id).first()
    assert.isNotNull(remaining)
  })

  test('re-subscribing the same endpoint updates it in place, not duplicated', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const endpoint = 'https://push.example.com/device-2'

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ endpoint, p256dh: 'old-p256dh', auth: 'old-auth' })

    await client
      .post('/api/v1/push/subscriptions')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ endpoint, p256dh: 'new-p256dh', auth: 'new-auth' })

    const matching = await PushSubscription.query().where('endpoint', endpoint)
    assert.lengthOf(matching, 1)
    assert.equal(matching[0]?.p256Dh, 'new-p256dh')
  })
})
