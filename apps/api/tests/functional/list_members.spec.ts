import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Test List' })
  return bodyData<ListDto>(response).id
}

test.group('List members', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('index lists accepted members, including the owner', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    index.assertStatus(200)
    const members = index.body().data
    assert.lengthOf(members, 2)
    const roles = members.map((m: { role: string }) => m.role).sort()
    assert.deepEqual(roles, ['owner', 'viewer'])
    assert.isDefined(members[0].user)
  })

  test('a viewer cannot list members', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)
  })

  test('an owner can change a member role and remove a member', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const editorMember = index.body().data.find((m: { userId: number }) => m.userId === editor.id)

    const update = await client
      .patch(`/api/v1/lists/${listId}/members/${editorMember.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'viewer' })
    update.assertStatus(200)
    assert.equal(update.body().data.role, 'viewer')

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/members/${editorMember.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
    destroy.assertStatus(204)

    const afterRemove = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(afterRemove.body().data, 1)
  })

  test('an editor cannot change roles or remove members', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const ownerMember = index.body().data.find((m: { userId: number }) => m.userId === owner.id)

    const update = await client
      .patch(`/api/v1/lists/${listId}/members/${ownerMember.id}`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ role: 'viewer' })
    update.assertStatus(403)
  })

  test('the last remaining owner cannot be demoted or removed', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const ownerMember = index.body().data[0]

    const demote = await client
      .patch(`/api/v1/lists/${listId}/members/${ownerMember.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'viewer' })
    demote.assertStatus(400)

    const remove = await client
      .delete(`/api/v1/lists/${listId}/members/${ownerMember.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
    remove.assertStatus(400)
  })

  test('a second owner can be demoted or removed once at least one owner remains', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const secondOwner = await signupAndGetUser(client)
    await addMember(listId, secondOwner.id, 'owner')

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    const secondOwnerMember = index
      .body()
      .data.find((m: { userId: number }) => m.userId === secondOwner.id)

    const demote = await client
      .patch(`/api/v1/lists/${listId}/members/${secondOwnerMember.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ role: 'editor' })
    demote.assertStatus(200)
    assert.equal(demote.body().data.role, 'editor')
  })
})
