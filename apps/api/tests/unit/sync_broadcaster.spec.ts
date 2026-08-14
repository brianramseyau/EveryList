import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import List from '#models/list'
import Store from '#models/store'
import ListStore from '#models/list_store'
import SyncEvent from '#models/sync_event'
import {
  broadcastSync,
  broadcastToStoreLists,
  resetSyncBroadcaster,
  setSyncBroadcasterForTesting,
  type SyncBroadcastInput,
} from '#services/sync_broadcaster'

test.group('SyncBroadcaster', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.teardown(() => resetSyncBroadcaster())

  test('broadcastSync persists a SyncEvent row via the real broadcaster', async ({ assert }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'sb1@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })

    await broadcastSync({ listId: list.id, entityType: 'list', entityId: list.id, op: 'create' })

    const events = await SyncEvent.query().where('listId', list.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0]!.entityType, 'list')
    assert.equal(events[0]!.op, 'create')
    assert.isNull(events[0]!.payload)
    await events[0]!.load('list')
    assert.equal(events[0]!.list.id, list.id)
  })

  test('a broadcast payload round-trips through the JSON text column', async ({ assert }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'sb4@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })

    await broadcastSync({
      listId: list.id,
      entityType: 'category',
      entityId: 1,
      op: 'update',
      payload: { categoryIds: [1, 2, 3] },
    })

    const event = await SyncEvent.query().where('listId', list.id).firstOrFail()
    assert.deepEqual(event.payload, { categoryIds: [1, 2, 3] })
  })

  test('a swapped-in fake broadcaster receives the call, and reset restores the real one', async ({
    assert,
  }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'sb2@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })

    const calls: SyncBroadcastInput[] = []
    setSyncBroadcasterForTesting({
      async broadcast(input) {
        calls.push(input)
      },
    })

    await broadcastSync({ listId: list.id, entityType: 'item', entityId: 1, op: 'create' })
    assert.lengthOf(calls, 1)
    assert.equal(calls[0]!.entityType, 'item')

    const eventsWhileFaked = await SyncEvent.query().where('listId', list.id)
    assert.lengthOf(eventsWhileFaked, 0, 'the fake broadcaster should not touch the database')

    resetSyncBroadcaster()
    await broadcastSync({ listId: list.id, entityType: 'item', entityId: 1, op: 'create' })
    const eventsAfterReset = await SyncEvent.query().where('listId', list.id)
    assert.lengthOf(eventsAfterReset, 1, 'the real broadcaster should be active again')
  })

  test('broadcastToStoreLists fans a store edit out to every attached list', async ({ assert }) => {
    const owner = await User.create({
      fullName: 'Ada Lovelace',
      email: 'sb3@example.com',
      password: 'password123',
    })
    const listA = await List.create({ name: 'List A', ownerId: owner.id })
    const listB = await List.create({ name: 'List B', ownerId: owner.id })
    const store = await Store.create({ name: 'Walmart', color: '#3b82f6', createdBy: owner.id })
    await ListStore.create({ listId: listA.id, storeId: store.id })
    await ListStore.create({ listId: listB.id, storeId: store.id })

    await broadcastToStoreLists(store, { entityType: 'store', entityId: store.id, op: 'update' })

    const eventsA = await SyncEvent.query().where('listId', listA.id)
    const eventsB = await SyncEvent.query().where('listId', listB.id)
    assert.lengthOf(eventsA, 1)
    assert.lengthOf(eventsB, 1)
  })
})
