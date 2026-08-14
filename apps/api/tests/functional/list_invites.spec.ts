import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import { DateTime } from 'luxon'
import ListInvite from '#models/list_invite'
import User from '#models/user'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return bodyData<ListDto>(response).id
}

test.group('List invites', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('an owner can create, list, and revoke invites', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    create.assertStatus(200)
    const invite = create.body().data
    assert.equal(invite.role, 'editor')
    assert.isString(invite.token)

    const index = await client
      .get(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(index.body().data, 1)

    const revoke = await client
      .delete(`/api/v1/lists/${listId}/invites/${invite.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
    revoke.assertStatus(204)

    const afterRevoke = await client
      .get(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(afterRevoke.body().data, 0)
  })

  test('an editor can also create invites', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ role: 'viewer' })
    create.assertStatus(200)
    assert.equal(create.body().data.role, 'viewer')
  })

  test('a viewer cannot create invites', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ role: 'viewer' })
    create.assertStatus(403)
  })

  test('previewing an invite requires no authentication', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const token = create.body().data.token

    const preview = await client.get(`/api/v1/invites/${token}`)
    preview.assertStatus(200)
    assert.equal(preview.body().data.listName, 'Groceries')
    assert.equal(preview.body().data.role, 'editor')
    assert.isDefined(preview.body().data.inviterName)
  })

  test('previewing an invite falls back to the inviter email when they have no full name', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const invite = create.body().data

    const ownerModel = await User.findOrFail(owner.id)
    ownerModel.fullName = null
    await ownerModel.save()

    const preview = await client.get(`/api/v1/invites/${invite.token}`)
    preview.assertStatus(200)
    assert.equal(preview.body().data.inviterName, ownerModel.email)
  })

  test('previewing a missing or revoked invite returns 404', async ({ client }) => {
    const missing = await client.get('/api/v1/invites/does-not-exist')
    missing.assertStatus(404)

    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const invite = create.body().data
    await client
      .delete(`/api/v1/lists/${listId}/invites/${invite.id}`)
      .header('Authorization', `Bearer ${owner.token}`)

    const revoked = await client.get(`/api/v1/invites/${invite.token}`)
    revoked.assertStatus(404)
  })

  test('an expired invite 404s on both preview and accept', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const invite = await ListInvite.findOrFail(create.body().data.id)
    invite.expiresAt = DateTime.now().minus({ days: 1 })
    await invite.save()

    const preview = await client.get(`/api/v1/invites/${invite.token}`)
    preview.assertStatus(404)

    const joiner = await signupAndGetUser(client)
    const accept = await client
      .post(`/api/v1/invites/${invite.token}/accept`)
      .header('Authorization', `Bearer ${joiner.token}`)
    accept.assertStatus(404)
  })

  test('accepting a missing invite returns 404', async ({ client }) => {
    const joiner = await signupAndGetUser(client)
    const accept = await client
      .post('/api/v1/invites/does-not-exist/accept')
      .header('Authorization', `Bearer ${joiner.token}`)
    accept.assertStatus(404)
  })

  test('accepting requires authentication', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const token = create.body().data.token

    const accept = await client.post(`/api/v1/invites/${token}/accept`)
    accept.assertStatus(401)
  })

  test('accepting an invite grants membership at the invited role', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const token = create.body().data.token

    const joiner = await signupAndGetUser(client)
    const accept = await client
      .post(`/api/v1/invites/${token}/accept`)
      .header('Authorization', `Bearer ${joiner.token}`)
    accept.assertStatus(200)
    assert.equal(accept.body().data.id, listId)

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${joiner.token}`)
    show.assertStatus(200)

    // Proves the accepted `editor` role actually grants write access, not
    // just read access to the list itself.
    const createCategory = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${joiner.token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    createCategory.assertStatus(200)
  })

  test('accepting an invite never downgrades an existing higher role', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'viewer' })
    const token = create.body().data.token

    const accept = await client
      .post(`/api/v1/invites/${token}/accept`)
      .header('Authorization', `Bearer ${editor.token}`)
    accept.assertStatus(200)

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const editorMember = index.body().data.find((m: { userId: number }) => m.userId === editor.id)
    assert.equal(editorMember.role, 'editor')
  })

  test('accepting a viewer invite upgrades an existing lower role', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const create = await client
      .post(`/api/v1/lists/${listId}/invites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    const token = create.body().data.token

    await client
      .post(`/api/v1/invites/${token}/accept`)
      .header('Authorization', `Bearer ${viewer.token}`)

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const viewerMember = index.body().data.find((m: { userId: number }) => m.userId === viewer.id)
    assert.equal(viewerMember.role, 'editor')
  })
})
