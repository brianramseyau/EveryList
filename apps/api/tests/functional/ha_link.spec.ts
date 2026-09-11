import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import UserHassLink from '#models/user_hass_link'
import { supervisorAuthClient } from '#services/supervisor_auth_client'
import { bodyData, signupAndGetUser } from './helpers.js'

type LinkBody = {
  linkedHaUsername: string | null
  detectedHaUsername: string | null
  detectedHaDisplayName: string | null
}

/** A genuinely-validated ingress request (trusted IP + valid x-ingress-path) whose detected
 *  identity is deliberately someone other than `haUsername` being linked, so the request still
 *  exercises the password-proof branch rather than the one-click-detected-identity branch. */
function manualLinkRequest(client: ApiClient, token: string) {
  return client
    .patch('/api/v1/ha-link')
    .header('Authorization', `Bearer ${token}`)
    .header('x-ingress-path', '/api/hassio_ingress/abc123')
    .header('x-remote-user-id', '999')
    .header('x-remote-user-name', 'someone-else')
}

test.group('Home Assistant account link', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  // getValidatedRemoteUser only trusts X-Remote-User-* headers from Supervisor's fixed proxy IP -
  // the functional test client's real peer address is the loopback address below, not Supervisor's
  // real one, so tests that want their ingress headers actually trusted must override it.
  const originalTrustedIp = process.env.SUPERVISOR_INGRESS_PROXY_IP
  group.each.setup(() => {
    process.env.SUPERVISOR_INGRESS_PROXY_IP = '127.0.0.1'
    return () => {
      if (originalTrustedIp === undefined) delete process.env.SUPERVISOR_INGRESS_PROXY_IP
      else process.env.SUPERVISOR_INGRESS_PROXY_IP = originalTrustedIp
    }
  })

  group.each.setup(() => {
    const original = supervisorAuthClient.validateCredentials
    return () => {
      supervisorAuthClient.validateCredentials = original
    }
  })

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

  test('one-click links the currently detected identity, with no password needed', async ({
    client,
    assert,
  }) => {
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

  test('rejects manually linking a username at all when the request is not genuinely from Ingress', async ({
    client,
  }) => {
    // Without this, an authenticated EveryList user could hammer this branch from anywhere the
    // server is reachable (e.g. the add-on's optional direct port) as an unthrottled credential
    // oracle against real Home Assistant accounts.
    const owner = await signupAndGetUser(client)
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ haUsername: 'alice', password: 'whatever' })
    response.assertStatus(403)
  })

  test('rejects manually linking a username with no password at all', async ({ client }) => {
    const owner = await signupAndGetUser(client)

    const response = await manualLinkRequest(client, owner.token).json({ haUsername: 'alice' })
    response.assertStatus(400)
  })

  test('rejects manually linking with a wrong Home Assistant password', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    supervisorAuthClient.validateCredentials = async () => false

    const response = await manualLinkRequest(client, owner.token).json({
      haUsername: 'alice',
      password: 'wrong',
    })
    response.assertStatus(401)
  })

  test('surfaces Supervisor being unavailable while manually linking, distinct from a wrong password', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    supervisorAuthClient.validateCredentials = async () => {
      throw new Error('SUPERVISOR_TOKEN is not set')
    }

    const response = await manualLinkRequest(client, owner.token).json({
      haUsername: 'alice',
      password: 'secret',
    })
    response.assertStatus(503)
  })

  test('links manually with a correct Home Assistant password', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    supervisorAuthClient.validateCredentials = async () => true

    const response = await manualLinkRequest(client, owner.token).json({
      haUsername: 'alice',
      password: 'correct',
    })
    response.assertStatus(200)
    assert.equal(bodyData<LinkBody>(response).linkedHaUsername, 'alice')
  })

  test('links manually with no detected identity at all, just a genuine ingress request', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .json({ haUsername: 'alice', password: 'correct' })

    assert.deepEqual(bodyData<LinkBody>(response), {
      linkedHaUsername: 'alice',
      detectedHaUsername: null,
      detectedHaDisplayName: null,
    })
  })

  test('links, then unlinks, an already-detected identity', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)

    const link = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
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

  test('unlinking still reports a currently-detected identity, if any', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
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
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
      .json({ haUsername: 'alice' })

    supervisorAuthClient.validateCredentials = async () => true
    const response = await manualLinkRequest(client, owner.token).json({
      haUsername: 'alice',
      password: 'whatever',
    })
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
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
      .json({ haUsername: 'alice' })

    const response = await client
      .patch('/api/v1/ha-link')
      .header('Authorization', `Bearer ${owner.token}`)
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
      .json({ haUsername: 'alice' })
    response.assertStatus(200)
    assert.equal(bodyData<LinkBody>(response).linkedHaUsername, 'alice')
  })
})
