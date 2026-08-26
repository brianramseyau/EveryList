import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import Item from '#models/item'
import { DELETED_ITEM_RETENTION_DAYS, purgeExpiredDeletedItems } from '#services/item_purge_service'

test.group('deleted-item TTL purge', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function seedList() {
    const user = await User.create({
      fullName: 'Ada Lovelace',
      email: 'purge1@example.com',
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

    const result = await purgeExpiredDeletedItems(now)

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

    const result = await purgeExpiredDeletedItems(now)

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

    const result = await purgeExpiredDeletedItems(now, { batchSize: 2, maxPerRun: 5 })

    assert.equal(result.purged, 5)
    const survivors = await Item.query().whereIn(
      'id',
      rows.map((row) => row.id)
    )
    assert.lengthOf(survivors, 5)

    const second = await purgeExpiredDeletedItems(now, { batchSize: 2, maxPerRun: 5 })
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

    const result = await purgeExpiredDeletedItems(now)

    assert.equal(result.purged, 0)
    const count = await Item.query().count('* as total')
    assert.equal(Number(count[0]!.$extras.total), 2)
  })
})
