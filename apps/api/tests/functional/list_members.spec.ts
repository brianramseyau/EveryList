import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import User from '#models/user'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string, name = 'Test List') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
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

  test('candidates lists users who share another list with the requester', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const shared = await signupAndGetUser(client)
    const alsoShared = await signupAndGetUser(client)
    const stranger = await signupAndGetUser(client)
    const sharedListId = await createList(client, owner.token, 'Shared List')
    await addMember(sharedListId, shared.id, 'viewer')
    await addMember(sharedListId, alsoShared.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')

    const candidates = await client
      .get(`/api/v1/lists/${listId}/members/candidates`)
      .header('Authorization', `Bearer ${owner.token}`)
    candidates.assertStatus(200)

    const ids = candidates.body().data.map((c: { user: { id: number } }) => c.user.id)
    assert.include(ids, shared.id)
    assert.include(ids, alsoShared.id)
    assert.notInclude(ids, stranger.id)
    assert.notInclude(ids, owner.id)

    const sharedCandidate = candidates
      .body()
      .data.find((c: { user: { id: number } }) => c.user.id === shared.id)
    assert.isArray(sharedCandidate.sharedListNames)
    assert.include(sharedCandidate.sharedListNames, 'Shared List')
  })

  test('candidates excludes users already on the list', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const shared = await signupAndGetUser(client)
    const sharedListId = await createList(client, owner.token, 'Shared List')
    await addMember(sharedListId, shared.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')
    await addMember(listId, shared.id, 'viewer')

    const candidates = await client
      .get(`/api/v1/lists/${listId}/members/candidates`)
      .header('Authorization', `Bearer ${owner.token}`)
    candidates.assertStatus(200)
    assert.lengthOf(candidates.body().data, 0)
  })

  test('candidates dedupes by user and sorts by display name', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const multi = await signupAndGetUser(client)
    const nameless = await signupAndGetUser(client)
    const sharedAId = await createList(client, owner.token, 'Shared A')
    await addMember(sharedAId, multi.id, 'viewer')
    const sharedBId = await createList(client, owner.token, 'Shared B')
    await addMember(sharedBId, multi.id, 'viewer')
    await addMember(sharedBId, nameless.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')

    const namelessUser = await User.findOrFail(nameless.id)
    namelessUser.fullName = null
    await namelessUser.save()
    const multiUser = await User.findOrFail(multi.id)
    multiUser.fullName = null
    await multiUser.save()

    const candidates = await client
      .get(`/api/v1/lists/${listId}/members/candidates`)
      .header('Authorization', `Bearer ${owner.token}`)
    candidates.assertStatus(200)

    assert.lengthOf(candidates.body().data, 2)
    // multi shares two lists with the owner, so its sharedListNames has both.
    const multiCandidate = candidates
      .body()
      .data.find((c: { user: { id: number } }) => c.user.id === multi.id)
    assert.sameMembers(multiCandidate.sharedListNames, ['Shared A', 'Shared B'])
  })

  test('a viewer cannot list candidates', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const viewer = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    await addMember(listId, viewer.id, 'viewer')

    const candidates = await client
      .get(`/api/v1/lists/${listId}/members/candidates`)
      .header('Authorization', `Bearer ${viewer.token}`)
    candidates.assertStatus(403)
  })

  test('an owner can directly add someone they already share a list with', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const known = await signupAndGetUser(client)
    const sharedListId = await createList(client, owner.token, 'Shared List')
    await addMember(sharedListId, known.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')

    const store = await client
      .post(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ userId: known.id, role: 'editor' })
    store.assertStatus(200)
    const member = store.body().data
    assert.equal(member.userId, known.id)
    assert.equal(member.role, 'editor')
    assert.isDefined(member.acceptedAt)

    const index = await client
      .get(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(index.body().data, 2)
  })

  test('directly adding requires sharing another list first', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const stranger = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const store = await client
      .post(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ userId: stranger.id, role: 'viewer' })
    store.assertStatus(400)
  })

  test('directly adding an existing member is rejected', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const known = await signupAndGetUser(client)
    const sharedListId = await createList(client, owner.token, 'Shared List')
    await addMember(sharedListId, known.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')
    await addMember(listId, known.id, 'viewer')

    const store = await client
      .post(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ userId: known.id, role: 'viewer' })
    store.assertStatus(400)
  })

  test('directly adding a nonexistent user is rejected', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const store = await client
      .post(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ userId: 999999, role: 'viewer' })
    store.assertStatus(400)
  })

  test('a viewer cannot directly add a member', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const viewer = await signupAndGetUser(client)
    const known = await signupAndGetUser(client)
    const sharedListId = await createList(client, owner.token, 'Shared List')
    await addMember(sharedListId, known.id, 'viewer')
    const listId = await createList(client, owner.token, 'New List')
    await addMember(listId, viewer.id, 'viewer')

    const store = await client
      .post(`/api/v1/lists/${listId}/members`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ userId: known.id, role: 'viewer' })
    store.assertStatus(403)
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
