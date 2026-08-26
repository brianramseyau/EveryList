import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import Item from '#models/item'
import SyncEvent from '#models/sync_event'
import {
  DELETED_ITEM_RETENTION_DAYS,
  SYNC_EVENT_RETENTION_DAYS,
  pruneExpiredDeletedItems,
  pruneExpiredSyncEvents,
  runPruneSweep,
} from '#services/prune_service'

test.group('deleted-item retention prune', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function seedList() {
    const user = await User.create({
      fullName: 'Ada Lovelace',
      email: 'prune1@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    return { user, list }
  }

  async function seedItem(
    list: List,
    user: User,
    name: string,
    deletedAt: DateTime | null
  ): Promise<Item> {
    return Item.create({
      listId: list.id,
      name,
      categoryId: null,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
      deletedAt,
    })
  }

  test('purges only soft-deleted items older than the retention window', async ({ assert }) => {
    const { user, list } = await seedList()
    const now = DateTime.now()

    const ancient = await seedItem(list, user, 'Ancient', now.minus({ days: 400 }))
    const expired = await seedItem(list, user, 'Expired', now.minus({ days: 200 }))
    const fresh = await seedItem(list, user, 'Fresh', now.minus({ days: 30 }))
    const active = await seedItem(list, user, 'Active', null)

    const result = await pruneExpiredDeletedItems(now)

    assert.equal(result.purged, 2)
    assert.isNull(await Item.find(ancient.id))
    assert.isNull(await Item.find(expired.id))
    assert.isNotNull(await Item.find(fresh.id))
    assert.isNotNull(await Item.find(active.id))
  })

  test('anchors on deletedAt: an item deleted exactly at the cutoff is kept, older is purged', async ({
    assert,
  }) => {
    const { user, list } = await seedList()
    const now = DateTime.now()

    const atCutoff = await seedItem(
      list,
      user,
      'AtCutoff',
      now.minus({ days: DELETED_ITEM_RETENTION_DAYS })
    )
    const justUnder = await seedItem(
      list,
      user,
      'JustUnder',
      now.minus({ days: DELETED_ITEM_RETENTION_DAYS - 1 })
    )
    const justOver = await seedItem(
      list,
      user,
      'JustOver',
      now.minus({ days: DELETED_ITEM_RETENTION_DAYS + 1 })
    )

    const result = await pruneExpiredDeletedItems(now)

    assert.equal(result.purged, 1)
    assert.isNotNull(await Item.find(atCutoff.id))
    assert.isNotNull(await Item.find(justUnder.id))
    assert.isNull(await Item.find(justOver.id))
  })

  test('batches deletes and stops at maxPerRun so a backlog drains over successive runs', async ({
    assert,
  }) => {
    const { user, list } = await seedList()
    const now = DateTime.now()

    const rows = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        seedItem(list, user, `Old ${index}`, now.minus({ days: 400 }))
      )
    )

    const result = await pruneExpiredDeletedItems(now, { batchSize: 2, maxPerRun: 5 })

    assert.equal(result.purged, 5)
    const survivors = await Item.query().whereIn(
      'id',
      rows.map((row) => row.id)
    )
    assert.lengthOf(survivors, 5)

    const second = await pruneExpiredDeletedItems(now, { batchSize: 2, maxPerRun: 5 })
    assert.equal(second.purged, 5)
    const remaining = await Item.query().whereIn(
      'id',
      rows.map((row) => row.id)
    )
    assert.lengthOf(remaining, 0)
  })

  test('is a no-op when nothing is expired', async ({ assert }) => {
    const { user, list } = await seedList()
    const now = DateTime.now()

    await seedItem(list, user, 'Fresh', now.minus({ days: 30 }))
    await seedItem(list, user, 'Active', null)

    const result = await pruneExpiredDeletedItems(now)

    assert.equal(result.purged, 0)
    const count = await Item.query().count('* as total')
    assert.equal(Number(count[0]!.$extras.total), 2)
  })
})

test.group('sync-event retention prune', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function seedList() {
    const user = await User.create({
      fullName: 'Ada Lovelace',
      email: 'prune2@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    return { user, list }
  }

  async function seedEvent(list: List, occurredAt: DateTime): Promise<SyncEvent> {
    return SyncEvent.create({
      listId: list.id,
      entityType: 'item',
      entityId: 1,
      op: 'create',
      occurredAt,
    })
  }

  test('prunes only sync events older than the retention window', async ({ assert }) => {
    const { list } = await seedList()
    const now = DateTime.now()

    const ancient = await seedEvent(list, now.minus({ days: 200 }))
    const expired = await seedEvent(list, now.minus({ days: 100 }))
    const fresh = await seedEvent(list, now.minus({ days: 30 }))

    const result = await pruneExpiredSyncEvents(now)

    assert.equal(result.purged, 2)
    assert.isNull(await SyncEvent.find(ancient.id))
    assert.isNull(await SyncEvent.find(expired.id))
    assert.isNotNull(await SyncEvent.find(fresh.id))
  })

  test('anchors on occurredAt: an event exactly at the cutoff is kept, older is pruned', async ({
    assert,
  }) => {
    const { list } = await seedList()
    const now = DateTime.now()

    const atCutoff = await seedEvent(list, now.minus({ days: SYNC_EVENT_RETENTION_DAYS }))
    const justUnder = await seedEvent(list, now.minus({ days: SYNC_EVENT_RETENTION_DAYS - 1 }))
    const justOver = await seedEvent(list, now.minus({ days: SYNC_EVENT_RETENTION_DAYS + 1 }))

    const result = await pruneExpiredSyncEvents(now)

    assert.equal(result.purged, 1)
    assert.isNotNull(await SyncEvent.find(atCutoff.id))
    assert.isNotNull(await SyncEvent.find(justUnder.id))
    assert.isNull(await SyncEvent.find(justOver.id))
  })

  test('batches deletes and stops at maxPerRun so a backlog drains over successive runs', async ({
    assert,
  }) => {
    const { list } = await seedList()
    const now = DateTime.now()

    const rows = await Promise.all(
      Array.from({ length: 10 }, (_, index) => seedEvent(list, now.minus({ days: 200 + index })))
    )

    const result = await pruneExpiredSyncEvents(now, { batchSize: 2, maxPerRun: 5 })

    assert.equal(result.purged, 5)
    const survivors = await SyncEvent.query().whereIn(
      'id',
      rows.map((row) => row.id)
    )
    assert.lengthOf(survivors, 5)

    const second = await pruneExpiredSyncEvents(now, { batchSize: 2, maxPerRun: 5 })
    assert.equal(second.purged, 5)
    const remaining = await SyncEvent.query().whereIn(
      'id',
      rows.map((row) => row.id)
    )
    assert.lengthOf(remaining, 0)
  })

  test('is a no-op when nothing is expired', async ({ assert }) => {
    const { list } = await seedList()
    const now = DateTime.now()

    await seedEvent(list, now.minus({ days: 30 }))

    const result = await pruneExpiredSyncEvents(now)

    assert.equal(result.purged, 0)
    const count = await SyncEvent.query().count('* as total')
    assert.equal(Number(count[0]!.$extras.total), 1)
  })
})

test.group('runPruneSweep', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('runs every retention sweep and returns combined counts', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Ada Lovelace',
      email: 'prune3@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: user.id })
    const now = DateTime.now()

    await Item.create({
      listId: list.id,
      name: 'Ancient',
      categoryId: null,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
      deletedAt: now.minus({ days: 400 }),
    })
    await SyncEvent.create({
      listId: list.id,
      entityType: 'item',
      entityId: 1,
      op: 'create',
      occurredAt: now.minus({ days: 200 }),
    })

    const result = await runPruneSweep(now)

    assert.equal(result.purgedItems, 1)
    assert.equal(result.purgedSyncEvents, 1)
  })
})
