import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import UserHassLink from '#models/user_hass_link'
import { bodyData, signupAndGetUser } from './helpers.js'

type LinkBody = {
  linkedHaUsername: string | null
  detectedHaUsername: string | null
  detectedHaDisplayName: string | null
}

test.group('Home Assistant account link', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const show = await client.get('/api/v1/ha-link')
    show.assertStatus(401)

    const update = await client.patch('/api/v1/ha-link').json({ haUsername: 'alice' })
    update.assertStatus(401)
  })

  test('defaults to unlinked, with no detected identity outside Ingress', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const response = await client
      .get('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
    response.assertStatus(200)
    assert.deepEqual(bodyData<LinkBody>(response), {
      linkedHaUsername: null,
      detectedHaUsername: null,
      detectedHaDisplayName: null,
    })
  })

  test('reports the Supervisor-detected identity on a validated ingress request', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const response = await client
      .get('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
      .header('x-remote-user-display-name', 'Alice')
    assert.deepEqual(bodyData<LinkBody>(response), {
      linkedHaUsername: null,
      detectedHaUsername: 'alice',
      detectedHaDisplayName: 'Alice',
    })
  })

  test('links, then unlinks, a Home Assistant username manually', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)

    const link = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice' })
    link.assertStatus(200)
    assert.equal(bodyData<LinkBody>(link).linkedHaUsername, 'alice')

    const show = await client
      .get('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
    assert.equal(bodyData<LinkBody>(show).linkedHaUsername, 'alice')

    const unlink = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: null })
    unlink.assertStatus(200)
    assert.isNull(bodyData<LinkBody>(unlink).linkedHaUsername)

    assert.isNull(await UserHassLink.findBy('userId', owner.id))
  })

  test('one-click links the detected identity', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
      .json({ haUsername: 'alice' })

    assert.deepEqual(bodyData<LinkBody>(response), {
      linkedHaUsername: 'alice',
      detectedHaUsername: 'alice',
      detectedHaDisplayName: 'alice',
    })
  })

  test('unlinking still reports a currently-detected identity, if any', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice' })

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'bob')
      .header('x-remote-user-display-name', 'Bob')
      .json({ haUsername: null })

    assert.deepEqual(bodyData<LinkBody>(response), {
      linkedHaUsername: null,
      detectedHaUsername: 'bob',
      detectedHaDisplayName: 'Bob',
    })
  })

  test('rejects linking a username already claimed by a different account', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)
    await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ haUsername: 'alice' })

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice' })
    response.assertStatus(400)
  })

  test('re-linking your own already-linked username is a no-op, not a conflict', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice' })

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice' })
    response.assertStatus(200)
    assert.equal(bodyData<LinkBody>(response).linkedHaUsername, 'alice')
  })
})
