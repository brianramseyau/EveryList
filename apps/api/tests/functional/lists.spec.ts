import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ItemDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

test.group('Lists CRUD', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/lists')
    response.assertStatus(401)
  })

  test('signup seeds a starter Groceries list owned by the new user', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const index = await client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    const indexed = bodyData<ListDto[]>(index)
    assert.lengthOf(indexed, 1)
    assert.equal(indexed[0]?.name, 'Groceries')
    assert.equal(indexed[0]?.icon, 'basket')
    assert.equal(indexed[0]?.color, '#f97316')
    assert.equal(indexed[0]?.itemCount, 0)
  })

  test('creates, lists, updates, and soft-deletes a list', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const authed = () => client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Groceries' })
    create.assertStatus(200)
    const createdList = bodyData<ListDto>(create)
    const listId = createdList.id
    assert.equal(createdList.name, 'Groceries')
    assert.equal(createdList.color, '#3b82f6')
    assert.equal(createdList.itemCount, 0)

    const index = await authed()
    index.assertStatus(200)
    const indexed = bodyData<ListDto[]>(index)
    // Signup seeds a starter "Groceries" list, so the index has that plus
    // the one created above.
    assert.lengthOf(indexed, 2)
    const indexedCreated = indexed.find((list) => list.id === listId)
    assert.equal(indexedCreated?.itemCount, 0)

    const item = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    const itemId = bodyData<ItemDto>(item).id

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    show.assertStatus(200)
    const shown = bodyData<ListDto>(show)
    assert.equal(shown.id, listId)
    assert.equal(shown.itemCount, 1, 'itemCount reflects unchecked, undeleted items')

    await client
      .patch(`/api/v1/lists/${listId}/items/${itemId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ checked: true })

    const showAfterCheck = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    assert.equal(bodyData<ListDto>(showAfterCheck).itemCount, 0, 'itemCount excludes checked items')

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Weekly Groceries', archived: true })
    update.assertStatus(200)
    const updatedList = bodyData<ListDto>(update)
    assert.equal(updatedList.name, 'Weekly Groceries')
    assert.isTrue(updatedList.archived)
    assert.isFalse(updatedList.badgeExcluded)

    const excludeFromBadge = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ badgeExcluded: true })
    excludeFromBadge.assertStatus(200)
    assert.isTrue(bodyData<ListDto>(excludeFromBadge).badgeExcluded)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const showDeleted = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    showDeleted.assertStatus(404)

    const updateDeleted = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Should not apply' })
    updateDeleted.assertStatus(404)
  })

  test('update/destroy honor expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Groceries' })
    const list = bodyData<ListDto & { version: number }>(create)
    assert.equal(list.version, 1)

    const unversioned = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Weekly Groceries' })
    unversioned.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(unversioned).version, 2)

    const stale = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Stale Name', expectedVersion: 1 })
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)

    const matching = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Monthly Groceries', expectedVersion: 2 })
    matching.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(matching).version, 3)

    const staleDestroy = await client
      .delete(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 2 })
    staleDestroy.assertStatus(409)

    const destroy = await client
      .delete(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 3 })
    destroy.assertStatus(204)
  })

  test("a user cannot see or update another user's list", async ({ client }) => {
    const ownerToken = await signupAndGetToken(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${ownerToken}`)
      .json({ name: 'Private list' })
    const listId = bodyData<ListDto>(create).id

    const otherToken = await signupAndGetToken(client)
    const response = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${otherToken}`)
    response.assertStatus(404)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${otherToken}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(404)
  })

  test('a viewer can see a list but cannot update or delete it', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    show.assertStatus(200)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    destroy.assertStatus(403)
  })

  test('an editor can see a list but cannot update or delete it (owner-only)', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    show.assertStatus(200)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    destroy.assertStatus(403)
  })

  test('passcodeHash round-trips through update and is null by default; only an owner can set it', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const initialShow = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.isNull(bodyData<ListDto>(initialShow).passcodeHash)

    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const editorAttempt = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ passcodeHash: 'salt:hash' })
    editorAttempt.assertStatus(403)

    const setPasscode = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ passcodeHash: 'abc123:def456' })
    setPasscode.assertStatus(200)
    assert.equal(bodyData<ListDto>(setPasscode).passcodeHash, 'abc123:def456')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    assert.equal(bodyData<ListDto>(show).passcodeHash, 'abc123:def456')

    const clearPasscode = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ passcodeHash: null })
    clearPasscode.assertStatus(200)
    assert.isNull(bodyData<ListDto>(clearPasscode).passcodeHash)
  })

  test('a shared list appears in the index for every member', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${viewer.token}`)
    const ids = bodyData<ListDto[]>(index).map((list) => list.id)
    assert.include(ids, listId)
  })
})
