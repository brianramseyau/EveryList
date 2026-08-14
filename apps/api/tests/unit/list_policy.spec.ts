import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import Store from '#models/store'
import ListStore from '#models/list_store'
import ListPolicy from '#policies/list_policy'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

test.group('ListPolicy', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('roleFor returns null with no accepted membership', async ({ assert }) => {
    const owner = await makeUser('owner@example.com')
    const stranger = await makeUser('stranger@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    await ListMember.create({
      listId: list.id,
      userId: owner.id,
      role: 'owner',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    assert.isNull(await ListPolicy.roleFor(stranger.id, list.id))
  })

  test('roleFor ignores a pending (not-yet-accepted) membership', async ({ assert }) => {
    const owner = await makeUser('owner2@example.com')
    const invitee = await makeUser('invitee@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    await ListMember.create({
      listId: list.id,
      userId: invitee.id,
      role: 'editor',
      invitedAt: DateTime.now(),
      acceptedAt: null,
    })

    assert.isNull(await ListPolicy.roleFor(invitee.id, list.id))
  })

  test('requireList throws 404 for a nonexistent list', async ({ assert }) => {
    const user = await makeUser('u1@example.com')
    await assert.rejects(() => ListPolicy.requireList(user.id, 999999, 'viewer'), /List not found/)
  })

  test('requireList throws 404 for a list the user is not a member of', async ({ assert }) => {
    const owner = await makeUser('u2@example.com')
    const stranger = await makeUser('u3@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })

    await assert.rejects(
      () => ListPolicy.requireList(stranger.id, list.id, 'viewer'),
      /List not found/
    )
  })

  test('requireList throws 403 when role is below the minimum', async ({ assert }) => {
    const owner = await makeUser('u4@example.com')
    const viewer = await makeUser('u5@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    await ListMember.create({
      listId: list.id,
      userId: viewer.id,
      role: 'viewer',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    await assert.rejects(() => ListPolicy.requireList(viewer.id, list.id, 'editor'), /permission/)
  })

  test('requireList returns the list when role meets the minimum', async ({ assert }) => {
    const owner = await makeUser('u6@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    await ListMember.create({
      listId: list.id,
      userId: owner.id,
      role: 'owner',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    const found = await ListPolicy.requireList(owner.id, list.id, 'owner')
    assert.equal(found.id, list.id)
  })

  test('storeRoleFor returns null when the store is attached to no list the user belongs to', async ({
    assert,
  }) => {
    const owner = await makeUser('u7@example.com')
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: owner.id })

    assert.isNull(await ListPolicy.storeRoleFor(owner.id, store.id))
  })

  test('storeRoleFor returns the best role across every list the store is attached to', async ({
    assert,
  }) => {
    const user = await makeUser('u8@example.com')
    const viewerList = await List.create({ name: 'Viewer list', ownerId: user.id })
    const editorList = await List.create({ name: 'Editor list', ownerId: user.id })
    const secondViewerList = await List.create({ name: 'Second viewer list', ownerId: user.id })
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: user.id })
    await ListStore.create({ listId: viewerList.id, storeId: store.id })
    await ListStore.create({ listId: editorList.id, storeId: store.id })
    await ListStore.create({ listId: secondViewerList.id, storeId: store.id })
    await ListMember.create({
      listId: viewerList.id,
      userId: user.id,
      role: 'viewer',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })
    await ListMember.create({
      listId: editorList.id,
      userId: user.id,
      role: 'editor',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })
    // A third, lower-ranked membership after the best one exercises the
    // reduce's "not better than current best" branch too.
    await ListMember.create({
      listId: secondViewerList.id,
      userId: user.id,
      role: 'viewer',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    assert.equal(await ListPolicy.storeRoleFor(user.id, store.id), 'editor')
  })

  test('requireStoreRole throws 404 for a nonexistent store', async ({ assert }) => {
    const user = await makeUser('u9@example.com')
    await assert.rejects(
      () => ListPolicy.requireStoreRole(user.id, 999999, 'viewer'),
      /List not found/
    )
  })

  test('requireStoreRole throws 403 when the best role is below the minimum', async ({
    assert,
  }) => {
    const owner = await makeUser('u10@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: owner.id })
    await ListStore.create({ listId: list.id, storeId: store.id })
    await ListMember.create({
      listId: list.id,
      userId: owner.id,
      role: 'viewer',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    await assert.rejects(
      () => ListPolicy.requireStoreRole(owner.id, store.id, 'editor'),
      /permission/
    )
  })

  test('requireStoreRole returns the store when the best role meets the minimum', async ({
    assert,
  }) => {
    const owner = await makeUser('u11@example.com')
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: owner.id })
    await ListStore.create({ listId: list.id, storeId: store.id })
    await ListMember.create({
      listId: list.id,
      userId: owner.id,
      role: 'owner',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })

    const found = await ListPolicy.requireStoreRole(owner.id, store.id, 'editor')
    assert.equal(found.id, store.id)
  })
})
