import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import type { UserDto } from '@everylist/shared'
import User from '#models/user'
import { supervisorAuthClient } from '#services/supervisor_auth_client'
import { bodyData, signupAndGetUser } from './helpers.js'

type AuthResponse = { user: UserDto; token: string }

async function linkHaUsername(
  client: import('@japa/api-client').ApiClient,
  token: string,
  haUsername: string
) {
  await client
    .patch('/api/v1/ha-link')
    .header('Authorization', `Bearer ${token}`)
    .json({ haUsername })
}

test.group('HA sign-in — implicit (Ingress identity)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

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

  test('is not fooled by a spoofed remote-user header without a validated ingress path', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant-identity')
      .header('x-remote-user-id', '1')
      .header('x-remote-user-name', 'alice')
    response.assertStatus(401)
  })
})

test.group('HA sign-in — explicit (auth_api)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  group.each.setup(() => {
    const original = supervisorAuthClient.validateCredentials
    return () => {
      supervisorAuthClient.validateCredentials = original
    }
  })

  test('rejects invalid Home Assistant credentials', async ({ client }) => {
    supervisorAuthClient.validateCredentials = async () => false

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'wrong' })
    response.assertStatus(401)
  })

  test('reports a distinct error when valid credentials have no linked account', async ({
    client,
  }) => {
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'correct' })
    response.assertStatus(404)
  })

  test('signs in with valid credentials for a linked account', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'correct' })
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

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'correct' })
    response.assertStatus(503)
  })

  test('denies a disabled linked account the same way normal login does', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    await linkHaUsername(client, owner.token, 'alice')
    const user = await User.findOrFail(owner.id)
    user.disabledAt = DateTime.now()
    await user.save()
    supervisorAuthClient.validateCredentials = async () => true

    const response = await client
      .post('/api/v1/auth/login-with-home-assistant')
      .json({ username: 'alice', password: 'correct' })
    response.assertStatus(403)
  })
})
