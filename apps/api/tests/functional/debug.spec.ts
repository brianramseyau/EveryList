import fs from 'node:fs'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { DebugResponse } from '@everylist/shared'
import { loadFileCache, serverConfigYamlPath } from '#services/server_config'
import { signupAndGetUser } from './helpers.js'

test.group('GET /api/v1/debug', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  // See server_config.spec.ts's group setup for why config.yaml (and its in-memory cache) needs
  // clearing between tests — one test below writes to it via PATCH /api/v1/server-config.
  group.each.setup(() => {
    const filePath = serverConfigYamlPath()
    return () => {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true })
      loadFileCache()
    }
  })

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/debug')
    response.assertStatus(401)
  })

  test('returns runtime/environment diagnostics for user id 1', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    // The first user created against an empty (per-test) database — the endpoint hard-codes
    // its allowlist to exactly this id, since the app has no admin role to gate on instead.
    assert.equal(user.id, 1)

    const response = await client
      .get('/api/v1/debug')
      .header('Authorization', `Bearer ${user.token}`)
    response.assertStatus(200)

    const body = response.body() as DebugResponse
    assert.properties(body, ['app', 'runtime', 'request', 'env'])
    assert.properties(body.app, ['version', 'commit', 'builtAt', 'nodeEnv', 'appUrl'])
    assert.equal(body.app.nodeEnv, 'test')
    assert.properties(body.runtime, ['nodeVersion', 'platform', 'arch', 'pid', 'uptimeSeconds'])
    assert.equal(body.env.SMTP2GO_PASSWORD, 'not set')
  })

  test('reflects a file-set server-config value with a (file) suffix', async ({
    client,
    assert,
  }) => {
    const admin = await signupAndGetUser(client)

    await client
      .patch('/api/v1/server-config')
      .header('Authorization', `Bearer ${admin.token}`)
      .json({
        mailHost: 'mail.example.com',
        mailPassword: 'hunter2',
        authentikClientSecret: 'sekret',
      })

    const response = await client
      .get('/api/v1/debug')
      .header('Authorization', `Bearer ${admin.token}`)
    const body = response.body() as DebugResponse
    assert.equal(body.env.SMTP2GO_HOST, 'mail.example.com (file)')
    assert.equal(body.env.SMTP2GO_PASSWORD, 'set')
    assert.equal(body.env.AUTHENTIK_CLIENT_SECRET, 'set')
    assert.isTrue(body.env.CONFIG_YAML_WRITABLE)
  })

  test('forbids any user other than id 1', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)
    assert.equal(admin.id, 1)
    const other = await signupAndGetUser(client)
    assert.notEqual(other.id, 1)

    const response = await client
      .get('/api/v1/debug')
      .header('Authorization', `Bearer ${other.token}`)
    response.assertStatus(403)
  })
})
