import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import { nextListMemberSortOrder } from '#services/list_member_sort'

test.group('nextListMemberSortOrder', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('runs the lookup on a given transaction client instead of the default connection', async ({
    assert,
  }) => {
    const owner = await User.create({
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
      password: 'password123',
    })
    const list = await List.create({ name: 'Groceries', ownerId: owner.id })
    const now = DateTime.now()

    await db.transaction(async (trx) => {
      await ListMember.create(
        {
          listId: list.id,
          userId: owner.id,
          role: 'owner',
          invitedAt: now,
          acceptedAt: now,
          sortOrder: await nextListMemberSortOrder(owner.id, trx),
        },
        { client: trx }
      )

      // A second call within the same open transaction must see the row
      // just created above via that transaction's own client — a plain
      // (non-transacted) query wouldn't see it yet, and would wrongly
      // return 0 again instead of 1.
      const next = await nextListMemberSortOrder(owner.id, trx)
      assert.equal(next, 1)
    })
  })
})
