import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import type { UserDto } from '@everylist/shared'
import User from '#models/user'
import { supervisorAuthClient } from '#services/supervisor_auth_client'
import { bodyData, signupAndGetUser } from './helpers.js'

type AuthResponse = { user: UserDto; token: string }

/** Links `haUsername` to `token`'s account via the one-click (Supervisor-detected-identity) path
 *  — the only way to create a link with no password, now that manual linking requires proving
 *  ownership (see ha_link_controller.ts). Requires `SUPERVISOR_INGRESS_PROXY_IP` already set to
 *  the test client's real peer IP. */
async function linkHaUsername(client: ApiClient, token: string, haUsername: string) {
  await client
    .patch('/api/v1/ha-link')
    .header('Authorization', `Bearer ${token}`)
    .header('x-ingress-path', '/api/hassio_ingress/abc123')
    .header('x-remote-user-id', '1')
    .header('x-remote-user-name', haUsername)
    .json({ haUsername })
}

/** The explicit `login-with-home-assistant` endpoint requires a genuinely validated ingress
 *  request (see ha_auth_controller.ts) — these headers make a request look like one, independent
 *  of which specific HA username (if any) is currently detected. */
function asIngressRequest(client: ApiClient, path: string) {
  return client
    .post(path)
    .header('x-ingress-path', '/api/hassio_ingress/abc123')
    .header('x-remote-user-id', '999')
    .header('x-remote-user-name', 'someone-else')
}

test.group('HA sign-in — implicit (Ingress identity)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  const originalTrustedIp = process.env.SUPERVISOR_INGRESS_PROXY_IP
  group.each.setup(() => {
    process.env.SUPERVISOR_INGRESS_PROXY_IP = '127.0.0.1'
    return () => {
      if (originalTrustedIp === undefined) delete process.env.SUPERVISOR_INGRESS_PROXY_IP
      else process.env.SUPERVISOR_INGRESS_PROXY_IP = originalTrustedIp
    }
  })

  test('rejects when no valid ingress identity is detected', async ({ client }) => {
    const response = await client.post('/api/v1/auth/login-with-home-assistant-identity')
    response.assertStatus(401)
  })

  test('reports not-linked when the detected identity has no matching account', async ({
    client,
  }) => {
    const response = await client
      .post('/api/v1/auth/login-with-home-assistant-identity')
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
    response.assertStatus(404)
  })

  test('signs in silently when the detected identity is linked', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant-identity')
      .header('x-ingress-path', '/api/hassio_ingress/abc123')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
    response.assertStatus(200)
    const body = bodyData<AuthResponse>(response)
    assert.equal(body.user.id, owner.id)
    assert.isString(body.token)
  })

  test('is not fooled by a spoofed remote-user header from a non-Supervisor source IP', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')

    const originalTestIp = process.env.SUPERVISOR_INGRESS_PROXY_IP
    process.env.SUPERVISOR_INGRESS_PROXY_IP = '203.0.113.7'
    try {
      const response = await client
        .post('/api/v1/auth/login-with-home-assistant-identity')
        .header('x-ingress-path', '/api/hassio_ingress/abc123')
        .header('x-remote-user-id', '1')
        .header('x-remote-user-name', 'alice')
      response.assertStatus(401)
    } finally {
      process.env.SUPERVISOR_INGRESS_PROXY_IP = originalTestIp
    }
  })
})

test.group('HA sign-in — explicit (auth_api)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

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

  test('rejects when the request did not genuinely come through Ingress', async ({ client }) => {
    // Both PLAN_27_PHASE_HOME_ASSISTANT_ADDON.md and DOCS.md scope this to Ingress only — without
    // the server-side check, this credential-validation oracle would be reachable from anywhere
    // the server itself is, e.g. the add-on's optional direct port.
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'correct' })
    response.assertStatus(403)
  })

  test('rejects invalid Home Assistant credentials', async ({ client }) => {
    supervisorAuthClient.validateCredentials = async () => false

    const response = await asIngressRequest(client, '/api/v1/auth/login-with-home-assistant').json({
      username: 'alice',
      password: 'wrong',
    })
    response.assertStatus(401)
  })

  test('reports a distinct error when valid credentials have no linked account', async ({
    client,
  }) => {
    supervisorAuthClient.validateCredentials = async () => true

    const response = await asIngressRequest(client, '/api/v1/auth/login-with-home-assistant').json({
      username: 'alice',
      password: 'correct',
    })
    response.assertStatus(404)
  })

  test('signs in with valid credentials for a linked account', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')
    supervisorAuthClient.validateCredentials = async () => true

    const response = await asIngressRequest(client, '/api/v1/auth/login-with-home-assistant').json({
      username: 'alice',
      password: 'correct',
    })
    response.assertStatus(200)
    const body = bodyData<AuthResponse>(response)
    assert.equal(body.user.id, owner.id)
    assert.isString(body.token)
  })

  test('surfaces Supervisor being unavailable as 503, distinct from invalid credentials', async ({
    client,
  }) => {
    supervisorAuthClient.validateCredentials = async () => {
      throw new Error('SUPERVISOR_TOKEN is not set')
    }

    const response = await asIngressRequest(client, '/api/v1/auth/login-with-home-assistant').json({
      username: 'alice',
      password: 'correct',
    })
    response.assertStatus(503)
  })

  test('denies a disabled linked account the same way normal login does', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')
    const user = await User.findOrFail(owner.id)
    user.disabledAt = DateTime.now()
    await user.save()
    supervisorAuthClient.validateCredentials = async () => true

    const response = await asIngressRequest(client, '/api/v1/auth/login-with-home-assistant').json({
      username: 'alice',
      password: 'correct',
    })
    response.assertStatus(403)
  })
})
