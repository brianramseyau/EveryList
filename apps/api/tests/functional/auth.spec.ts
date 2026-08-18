import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import env from '#start/env'
import type { ListDto, ListInviteDto } from '@everylist/shared'
import { bodyData } from './helpers.js'

// Every serialize()'d response is wrapped under a top-level "data" key by
// the app's ApiSerializer (see providers/api_provider.ts).

test.group('Auth flow', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('signup creates a user and returns a bearer token', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(200)
    assert.equal(response.body().data.user.email, 'ada@example.com')
    assert.isString(response.body().data.token)
  })

  test('signup normalizes a mixed-case email to lowercase', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'Ada@Example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(200)
    assert.equal(response.body().data.user.email, 'ada@example.com')
  })

  test('signup rejects a duplicate email with different casing', async ({ client }) => {
    await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Two',
      email: 'ADA@EXAMPLE.COM',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(422)
  })

  test('login works with a differently-cased email', async ({ client, assert }) => {
    await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'ADA@Example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    assert.isString(response.body().data.token)
  })

  test('signup rejects a duplicate email', async ({ client }) => {
    await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Two',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(422)
  })

  test('login with valid credentials returns a bearer token', async ({ client, assert }) => {
    await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'ada@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    assert.isString(response.body().data.token)
  })

  test('login with invalid credentials is rejected', async ({ client }) => {
    const response = await client.post('/api/v1/auth/login').json({
      email: 'nobody@example.com',
      password: 'wrong-password',
    })

    response.assertStatus(400)
  })

  test('profile requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/account/profile')

    response.assertStatus(401)
  })

  test('profile returns the authenticated user', async ({ client, assert }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const token = signup.body().data.token

    const response = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().data.email, 'ada@example.com')
  })

  test('updating profile requires authentication', async ({ client }) => {
    const response = await client.patch('/api/v1/account/profile').json({ fullName: 'Ada' })

    response.assertStatus(401)
  })

  test('profile update persists a new fullName for the authenticated user', async ({
    client,
    assert,
  }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const token = signup.body().data.token

    const response = await client
      .patch('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
      .json({ fullName: 'Ada King' })

    response.assertStatus(200)
    assert.equal(response.body().data.fullName, 'Ada King')

    const profile = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    assert.equal(profile.body().data.fullName, 'Ada King')
  })

  test('profile update accepts a null fullName', async ({ client, assert }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const token = signup.body().data.token

    const response = await client
      .patch('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
      .json({ fullName: null })

    response.assertStatus(200)
    assert.isNull(response.body().data.fullName)
  })

  test('refresh rotates the access token', async ({ client, assert }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const oldToken = signup.body().data.token

    const refresh = await client
      .post('/api/v1/account/refresh')
      .header('Authorization', `Bearer ${oldToken}`)

    refresh.assertStatus(200)
    const newToken = refresh.body().data.token
    assert.isString(newToken)
    assert.notEqual(newToken, oldToken)

    const oldTokenReuse = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${oldToken}`)
    oldTokenReuse.assertStatus(401)

    const newTokenWorks = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${newToken}`)
    newTokenWorks.assertStatus(200)
  })

  test('logout revokes the current access token', async ({ client }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const token = signup.body().data.token

    const logout = await client
      .post('/api/v1/account/logout')
      .header('Authorization', `Bearer ${token}`)
    logout.assertStatus(200)

    const afterLogout = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    afterLogout.assertStatus(401)
  })
})

test.group('Public signup toggle', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.teardown(() => {
    env.set('PUBLIC_SIGNUP_ENABLED', true)
  })

  test('signup is rejected while public signup is disabled', async ({ client }) => {
    env.set('PUBLIC_SIGNUP_ENABLED', false)

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })

    response.assertStatus(403)
  })

  test('signup with a valid invite token succeeds while public signup is disabled', async ({
    client,
    assert,
  }) => {
    const ownerSignup = await client.post('/api/v1/auth/signup').json({
      fullName: 'Owner',
      email: 'owner@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    const ownerToken = ownerSignup.body().data.token

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${ownerToken}`)
      .json({ name: 'Shared Household' })
    const listId = bodyData<ListDto>(listResponse).id

    const inviteResponse = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${ownerToken}`)
      .json({ role: 'editor' })
    const inviteToken = bodyData<ListInviteDto>(inviteResponse).token

    env.set('PUBLIC_SIGNUP_ENABLED', false)

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      inviteToken,
    })

    response.assertStatus(200)
    assert.equal(response.body().data.user.email, 'ada@example.com')
  })

  test('signup with an invalid invite token is rejected while public signup is disabled', async ({
    client,
  }) => {
    env.set('PUBLIC_SIGNUP_ENABLED', false)

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      inviteToken: 'does-not-exist',
    })

    response.assertStatus(403)
  })
})
