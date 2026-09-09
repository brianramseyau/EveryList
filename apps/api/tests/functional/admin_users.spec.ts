import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import type { AdminUserDto, ListDto } from '@everylist/shared'
import { bodyData, signupAndGetUser } from './helpers.js'

const PASSWORD = 'password123'

/** Signs up a user with a known email (unlike `signupAndGetUser`'s counter-generated address),
 * for tests that need to reference the email again later — e.g. logging back in. */
async function signupWithEmail(
  client: ApiClient,
  email: string
): Promise<{ token: string; id: number }> {
  const response = await client.post('/api/v1/auth/signup').json({
    fullName: 'Test User',
    email,
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
  })
  return { token: response.body().data.token, id: response.body().data.user.id }
}

test.group('Admin user management', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/admin/users')
    response.assertStatus(401)
  })

  test('forbids any user other than id 1', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)
    assert.equal(admin.id, 1)
    const other = await signupAndGetUser(client)
    assert.notEqual(other.id, 1)

    const index = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${other.token}`)
    index.assertStatus(403)

    const store = await client
      .post('/api/v1/admin/users')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ fullName: 'New Guy', email: 'new-guy@example.com', password: PASSWORD })
    store.assertStatus(403)

    const update = await client
      .patch(`/api/v1/admin/users/${admin.id}`)
      .header('Authorization', `Bearer ${other.token}`)
      .json({ fullName: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/admin/users/${admin.id}`)
      .header('Authorization', `Bearer ${other.token}`)
    destroy.assertStatus(403)
  })

  test('index lists every user for id 1', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const response = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
    response.assertStatus(200)

    const users = bodyData<AdminUserDto[]>(response)
    assert.sameMembers(
      users.map((u) => u.id),
      [admin.id, other.id]
    )
  })

  test('store creates a user without starter lists', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)

    const response = await client
      .post('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ fullName: 'New Guy', email: 'new-guy@example.com', password: PASSWORD })
    response.assertStatus(201)

    const created = bodyData<AdminUserDto>(response)
    assert.equal(created.email, 'new-guy@example.com')
    assert.isNull(created.disabledAt)

    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: 'new-guy@example.com', password: PASSWORD })
    login.assertStatus(200)

    const lists = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${login.body().data.token}`)
    lists.assertStatus(200)
    assert.lengthOf(bodyData<ListDto[]>(lists), 0)
  })

  test('store rejects a duplicate email', async ({ client }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')

    const response = await client
      .post('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ fullName: 'Dup', email: 'admin@example.com', password: PASSWORD })

    response.assertStatus(422)
  })

  test('update changes fullName and email', async ({ client, assert }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const response = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ fullName: 'Renamed', email: 'renamed@example.com' })
    response.assertStatus(200)

    const updated = bodyData<AdminUserDto>(response)
    assert.equal(updated.fullName, 'Renamed')
    assert.equal(updated.email, 'renamed@example.com')
  })

  test('update allows re-submitting a user’s own unchanged email', async ({ client, assert }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')
    const other = await signupWithEmail(client, 'other@example.com')

    const response = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ email: 'other@example.com' })
    response.assertStatus(200)
    assert.equal(bodyData<AdminUserDto>(response).email, 'other@example.com')
  })

  test('update rejects an email already used by a different user', async ({ client }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')
    const other = await signupWithEmail(client, 'other@example.com')

    const response = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ email: 'admin@example.com' })
    response.assertStatus(422)
  })

  test('update with a new password revokes the target’s existing tokens', async ({ client }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')
    const other = await signupWithEmail(client, 'other@example.com')

    const response = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ password: 'brand-new-password' })
    response.assertStatus(200)

    const oldTokenUse = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${other.token}`)
    oldTokenUse.assertStatus(401)

    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: 'other@example.com', password: 'brand-new-password' })
    login.assertStatus(200)
  })

  test('update can disable and re-enable a user', async ({ client, assert }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')
    const other = await signupWithEmail(client, 'other@example.com')

    const disable = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ disabled: true })
    disable.assertStatus(200)
    assert.isNotNull(bodyData<AdminUserDto>(disable).disabledAt)

    // An existing token stops working immediately, not just on next login.
    const blockedRequest = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${other.token}`)
    blockedRequest.assertStatus(403)

    const blockedLogin = await client
      .post('/api/v1/auth/login')
      .json({ email: 'other@example.com', password: PASSWORD })
    blockedLogin.assertStatus(403)

    const enable = await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ disabled: false })
    enable.assertStatus(200)
    assert.isNull(bodyData<AdminUserDto>(enable).disabledAt)

    const allowedLogin = await client
      .post('/api/v1/auth/login')
      .json({ email: 'other@example.com', password: PASSWORD })
    allowedLogin.assertStatus(200)
  })

  test('update refuses to disable the primary account', async ({ client }) => {
    const admin = await signupAndGetUser(client)

    const response = await client
      .patch(`/api/v1/admin/users/${admin.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ disabled: true })
    response.assertStatus(422)
  })

  test('destroy deletes a user and cascades their owned lists', async ({ client, assert }) => {
    const admin = await signupWithEmail(client, 'admin@example.com')
    const other = await signupWithEmail(client, 'other@example.com')

    const listResponse = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ name: "Other's List" })
    listResponse.assertStatus(200)

    const response = await client
      .delete(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
    response.assertStatus(204)

    const loginAttempt = await client
      .post('/api/v1/auth/login')
      .json({ email: 'other@example.com', password: PASSWORD })
    loginAttempt.assertStatus(400)

    const index = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
    assert.sameMembers(
      bodyData<AdminUserDto[]>(index).map((u) => u.id),
      [admin.id]
    )
  })

  test('destroy refuses to delete the primary account', async ({ client }) => {
    const admin = await signupAndGetUser(client)

    const response = await client
      .delete(`/api/v1/admin/users/${admin.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
    response.assertStatus(422)
  })
})
