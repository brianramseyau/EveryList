import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import type { AdminUserDto, ListDto } from '@everylist/shared'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
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

  test('store creates a user with starter lists by default', async ({ client, assert }) => {
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
    assert.sameMembers(
      bodyData<ListDto[]>(lists).map((l) => l.name),
      ['Todos', 'Shopping List']
    )
  })

  test('store creates a user without starter lists when createDefaultLists is false', async ({
    client,
    assert,
  }) => {
    const admin = await signupAndGetUser(client)

    const response = await client
      .post('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
      .json({
        fullName: 'New Guy',
        email: 'new-guy@example.com',
        password: PASSWORD,
        createDefaultLists: false,
      })
    response.assertStatus(201)

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

  test("index reports lastSeenAt, stamped by the user's own authenticated requests", async ({
    client,
    assert,
  }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const before = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
    const otherBefore = bodyData<AdminUserDto[]>(before).find((u) => u.id === other.id)!
    assert.isNull(otherBefore.lastSeenAt)

    await client.get('/api/v1/lists').header('Authorization', `Bearer ${other.token}`)

    const after = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
    const otherAfter = bodyData<AdminUserDto[]>(after).find((u) => u.id === other.id)!
    assert.isNotNull(otherAfter.lastSeenAt)
    assert.equal(otherAfter.updatedAt, otherBefore.updatedAt)
  })

  test('impersonate is forbidden for any user other than id 1', async ({ client }) => {
    await signupAndGetUser(client)
    const other = await signupAndGetUser(client)
    const third = await signupAndGetUser(client)

    const response = await client
      .post(`/api/v1/admin/users/${third.id}/impersonate`)
      .header('Authorization', `Bearer ${other.token}`)
    response.assertStatus(403)
  })

  test('impersonate returns a token that acts as the target without bumping their lastSeenAt', async ({
    client,
    assert,
  }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const response = await client
      .post(`/api/v1/admin/users/${other.id}/impersonate`)
      .header('Authorization', `Bearer ${admin.token}`)
    response.assertStatus(200)
    assert.equal(response.body().data.user.id, other.id)
    const token = response.body().data.token as string

    const profile = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    profile.assertStatus(200)
    assert.equal(profile.body().data.id, other.id)

    // Acting as the user isn't the user interacting — they've still never been seen.
    const index = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${admin.token}`)
    const otherRow = bodyData<AdminUserDto[]>(index).find((u) => u.id === other.id)!
    assert.isNull(otherRow.lastSeenAt)

    // ...and the impersonated session can't reach admin endpoints, being a non-primary user.
    const adminAttempt = await client
      .get('/api/v1/admin/users')
      .header('Authorization', `Bearer ${token}`)
    adminAttempt.assertStatus(403)
  })

  test('an impersonation token cannot be refreshed into a long-lived one', async ({ client }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const response = await client
      .post(`/api/v1/admin/users/${other.id}/impersonate`)
      .header('Authorization', `Bearer ${admin.token}`)
    const token = response.body().data.token as string

    const refresh = await client
      .post('/api/v1/account/refresh')
      .header('Authorization', `Bearer ${token}`)
    refresh.assertStatus(403)
  })

  test('impersonate refuses the primary account and disabled users', async ({ client }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)

    const self = await client
      .post(`/api/v1/admin/users/${admin.id}/impersonate`)
      .header('Authorization', `Bearer ${admin.token}`)
    self.assertStatus(422)

    await client
      .patch(`/api/v1/admin/users/${other.id}`)
      .header('Authorization', `Bearer ${admin.token}`)
      .json({ disabled: true })
    const disabled = await client
      .post(`/api/v1/admin/users/${other.id}/impersonate`)
      .header('Authorization', `Bearer ${admin.token}`)
    disabled.assertStatus(422)
  })

  test('impersonate 404s for an unknown user', async ({ client }) => {
    const admin = await signupAndGetUser(client)
    const response = await client
      .post('/api/v1/admin/users/99999/impersonate')
      .header('Authorization', `Bearer ${admin.token}`)
    response.assertStatus(404)
  })

  test('lastSeenAt is only rewritten once it is at least a minute old', async ({
    client,
    assert,
  }) => {
    const other = await signupAndGetUser(client)
    const stamp = async () => {
      const row = await User.findOrFail(other.id)
      return row.lastSeenAt
    }

    await client.get('/api/v1/lists').header('Authorization', `Bearer ${other.token}`)
    const first = await stamp()
    assert.isNotNull(first)

    // Within the throttle window: no rewrite.
    await client.get('/api/v1/lists').header('Authorization', `Bearer ${other.token}`)
    const second = await stamp()
    assert.equal(second!.toMillis(), first!.toMillis())

    // Once stale, the next request refreshes it.
    const stale = DateTime.now().minus({ minutes: 5 })
    await User.query()
      .where('id', other.id)
      .update({ last_seen_at: stale.toFormat('yyyy-MM-dd HH:mm:ss') })
    await client.get('/api/v1/lists').header('Authorization', `Bearer ${other.token}`)
    const third = await stamp()
    assert.isTrue(third!.toMillis() > stale.toMillis() + 60_000)
  })

  test('a PAT merely named "impersonation" is not treated as an impersonation session', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const list = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'L' })
    const listId = bodyData<ListDto>(list).id
    const pat = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'impersonation', listIds: [listId], role: 'editor' })
    pat.assertStatus(201)

    await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${(pat.body().data as { token: string }).token}`)

    const row = await User.findOrFail(owner.id)
    assert.isNotNull(row.lastSeenAt)
  })

  test('an impersonation session cannot mint or re-scope PATs, or change the password', async ({
    client,
  }) => {
    const admin = await signupAndGetUser(client)
    const other = await signupAndGetUser(client)
    const list = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ name: 'L' })
    const listId = bodyData<ListDto>(list).id
    const existing = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${other.token}`)
      .json({ name: 'ha', listIds: [listId], role: 'editor' })
    const imp = await client
      .post(`/api/v1/admin/users/${other.id}/impersonate`)
      .header('Authorization', `Bearer ${admin.token}`)
    const token = imp.body().data.token as string

    const mint = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'x', listIds: [listId], role: 'editor' })
    mint.assertStatus(403)

    const rescope = await client
      .patch(`/api/v1/tokens/${(existing.body().data as { id: string | number }).id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ listIds: [listId], role: 'viewer' })
    rescope.assertStatus(403)

    const password = await client
      .patch('/api/v1/account/password')
      .header('Authorization', `Bearer ${token}`)
      .json({
        currentPassword: PASSWORD,
        password: 'newpassword123',
        passwordConfirmation: 'newpassword123',
      })
    password.assertStatus(403)

    // Ending the session revokes the token.
    const logout = await client
      .post('/api/v1/account/logout')
      .header('Authorization', `Bearer ${token}`)
    logout.assertStatus(200)
    const after = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${token}`)
    after.assertStatus(401)
  })

  test('a failing last-seen write is logged, not turned into a failed request', async ({
    client,
    assert,
  }) => {
    const other = await signupAndGetUser(client)
    // Inside this test's rolled-back transaction, so the schema change never leaks out.
    await db.rawQuery('ALTER TABLE users DROP COLUMN last_seen_at')

    const response = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${other.token}`)
    response.assertStatus(200)
    assert.isDefined(other.id)
  })

  test('a user with no access token is not impersonated', ({ assert }) => {
    assert.isFalse(new User().isImpersonated)
  })
})
