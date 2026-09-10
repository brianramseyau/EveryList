import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { SetupResponse, SetupStatusDto } from '@everylist/shared'
import { bodyData, signupAndGetUser } from './helpers.js'

test.group('Setup wizard', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('status reports setup is needed on a fresh instance, with sane backup defaults', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/setup/status')

    response.assertStatus(200)
    const status = bodyData<SetupStatusDto>(response)
    assert.isTrue(status.needsSetup)
    assert.deepEqual(status.defaultBackupSettings, {
      frequency: 'weekly',
      timeOfDay: '03:00',
      retentionCount: 4,
    })
  })

  test('creates user id 1 with starter lists, a working token, and the chosen backup settings', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/v1/setup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      backup: { frequency: 'daily', timeOfDay: '04:30', retentionCount: 10 },
    })

    response.assertStatus(200)
    const body = bodyData<SetupResponse>(response)
    assert.equal(body.user.id, 1)
    assert.equal(body.user.email, 'ada@example.com')
    assert.isString(body.token)
    assert.deepEqual(body.backup, { frequency: 'daily', timeOfDay: '04:30', retentionCount: 10 })

    const lists = await client.get('/api/v1/lists').header('Authorization', `Bearer ${body.token}`)
    lists.assertStatus(200)
    const listNames = bodyData<Array<{ name: string }>>(lists).map((list) => list.name)
    assert.includeMembers(listNames, ['Todos', 'Shopping List'])

    const backupSettings = await client
      .get('/api/v1/backup-settings')
      .header('Authorization', `Bearer ${body.token}`)
    assert.deepEqual(bodyData<{ settings: unknown }>(backupSettings).settings, {
      frequency: 'daily',
      timeOfDay: '04:30',
      retentionCount: 10,
    })
  })

  test('rejects setup once a user already exists', async ({ client }) => {
    await signupAndGetUser(client)

    const response = await client.post('/api/v1/setup').json({
      fullName: 'Someone Else',
      email: 'someone@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 },
    })

    response.assertStatus(409)
  })

  test('status reflects setup already being done', async ({ client, assert }) => {
    await signupAndGetUser(client)

    const response = await client.get('/api/v1/setup/status')
    assert.isFalse(bodyData<SetupStatusDto>(response).needsSetup)
  })

  test('rejects a mismatched password confirmation', async ({ client }) => {
    const response = await client.post('/api/v1/setup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'does-not-match',
      backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 },
    })

    response.assertStatus(422)
  })

  test('rejects an invalid email', async ({ client }) => {
    const response = await client.post('/api/v1/setup').json({
      fullName: 'Ada Lovelace',
      email: 'not-an-email',
      password: 'password123',
      passwordConfirmation: 'password123',
      backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 },
    })

    response.assertStatus(422)
  })

  test('rejects invalid backup settings', async ({ client }) => {
    // `frequency` here is intentionally outside the real union — cast the same way
    // alexa.spec.ts does for a payload that has to violate the typed client's own contract.
    const response = await client.post('/api/v1/setup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      backup: { frequency: 'hourly', timeOfDay: '03:00', retentionCount: 4 },
    } as any)

    response.assertStatus(422)
  })
})
