import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import Item from '#models/item'
import ItemRecurrence from '#models/item_recurrence'
import SubItem from '#models/sub_item'
import ItemRecurrenceM from '#models/item_recurrence'
import { setItemChecked } from '#services/mcp/checkoff'
import { hasCapacityFor } from '#services/unchecked_limit'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

async function makeListWithCapacity(owner: User, name: string, maxUncheckedItems: number | null) {
  const list = await List.create({ name, ownerId: owner.id, maxUncheckedItems })
  await ListMember.create({
    listId: list.id,
    userId: owner.id,
    role: 'owner',
    invitedAt: DateTime.now(),
    acceptedAt: DateTime.now(),
  })
  return list
}

test.group('MCP checkoff service', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('completing a plain item sets checked/checkedAt and returns no spawn', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-check-1@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', null)
    const item = await Item.create({
      listId: list.id,
      name: 'Laundry',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, item, true)
    if ('refused' in result) return assert.fail('completion was unexpectedly refused')
    assert.isTrue(result.item.checked)
    // A plain (non-recurring) item never spawns a copy — completing it is just the check.
    assert.isNull(result.spawned)
    assert.isNull(result.discarded)
  })

  test('unchecking is intake: refused when the unchecked-item limit has no room', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-check-2@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', 1)
    const open = await Item.create({
      listId: list.id,
      name: 'Open chore',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })
    const done = await Item.create({
      listId: list.id,
      name: 'Done chore',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 1,
      createdBy: owner.id,
      version: 1,
    })

    // The one open item has already used the single slot: nothing fits, so reopening the
    // completed row is refused exactly like the checkbox and the HTTP path refuse it.
    assert.isFalse(await hasCapacityFor(list))
    void open
    const result = await setItemChecked(list, done, false)
    assert.isTrue('refused' in result)
  })

  test('completing a recurring item spawns its next copy in the same transaction', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-check-3@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', null)
    const series = await ItemRecurrence.create({
      interval: 1,
      unit: 'week',
      weekdays: JSON.stringify([1]),
      startDate: '2026-09-28',
      endType: 'never',
      occurrencesCreated: 1,
    })
    const item = await Item.create({
      listId: list.id,
      name: 'Trash',
      deadline: '2026-09-28',
      recurrenceId: series.id,
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, item, true)
    if ('refused' in result) return assert.fail('completion was unexpectedly refused')
    assert.isTrue(result.item.checked)
    // The spawned copy shares the name, is open, carries the same series and the next deadline.
    assert.isNotNull(result.spawned)
    if (!result.spawned) return
    assert.equal(result.spawned.name, 'Trash')
    assert.isFalse(result.spawned.checked)
    const reloadedSeries = await ItemRecurrenceM.find(series.id)
    assert.equal(result.spawned.recurrenceId, reloadedSeries?.id)

    // The series counter incremented (1 from the original + 1 from the spawn).
    assert.equal(reloadedSeries?.occurrencesCreated, 2)

    // Unchecking the completed row undoes the spawn: the copy is discarded (soft-deleted AND
    // detached from the series) while the reopened row keeps carrying the series for future
    // completions — exactly PLAN_30's "no two open items in one series" invariant.
    const undone = await setItemChecked(list, result.item, false)
    if ('refused' in undone) return assert.fail('undo was unexpectedly refused')
    assert.equal(undone.item.recurrenceId, series.id)
    assert.isNotNull(undone.discarded)
    const discardedRow = await Item.find(undone.discarded!.id)
    if (!discardedRow) return assert.fail('discarded row vanished')
    assert.isNotNull(discardedRow.deletedAt)
    assert.isNull(discardedRow.recurrenceId)
  })

  test('checking off is refused while open sub-tasks remain', async ({ assert }) => {
    const owner = await makeUser('mcp-check-4@example.com')
    const list = await makeListWithCapacity(owner, 'Packing', null)
    list.useSubtasks = true
    const item = await Item.create({
      listId: list.id,
      name: 'Camera bag',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })
    await SubItem.create({
      itemId: item.id,
      name: 'Lens cloth',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, item, true)
    assert.isTrue('refused' in result)
  })

  test('a completed item with no sub-tasks completes cleanly', async ({ assert }) => {
    const owner = await makeUser('mcp-check-4@example.com')
    const list = await makeListWithCapacity(owner, 'Packing', null)
    list.useSubtasks = true
    const item = await Item.create({
      listId: list.id,
      name: 'Camera bag',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })
    await SubItem.create({
      itemId: item.id,
      name: 'Lens cloth',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, item, true)
    assert.isFalse('refused' in result)
  })

  test('reopening a completed recurring item is blocked when a later occurrence is open', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-check-5@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', null)
    const series = await ItemRecurrence.create({
      interval: 1,
      unit: 'week',
      weekdays: JSON.stringify([1]),
      startDate: '2026-09-21',
      endType: 'never',
      occurrencesCreated: 2,
    })
    // A checked history row and *two* open rows of the same name — the series already has more
    // than one open item, so reopening the history row is refused outright ("blocked").
    const history = await Item.create({
      listId: list.id,
      name: 'Trash',
      deadline: '2026-09-21',
      recurrenceId: series.id,
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })
    for (const [index, deadline] of ['2026-09-28', '2026-10-05'].entries()) {
      await Item.create({
        listId: list.id,
        name: 'Trash',
        deadline,
        recurrenceId: series.id,
        checked: false,
        sortOrder: index + 1,
        createdBy: owner.id,
        version: 1,
      })
    }

    const result = await setItemChecked(list, history, false)
    assert.isTrue('refused' in result)
    if ('refused' in result) assert.include(result.refused, 'already has an open occurrence')
  })

  test('completing a recurring item does not spawn when a same-name row is already open', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-check-6@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', null)
    const series = await ItemRecurrence.create({
      interval: 1,
      unit: 'week',
      weekdays: JSON.stringify([1]),
      startDate: '2026-09-28',
      endType: 'never',
      occurrencesCreated: 1,
    })
    const recurring = await Item.create({
      listId: list.id,
      name: 'Trash',
      deadline: '2026-09-28',
      recurrenceId: series.id,
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })
    // A legacy duplicate — same name, already open — makes spawning a second copy wrong.
    await Item.create({
      listId: list.id,
      name: 'Trash',
      checked: false,
      sortOrder: 1,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, recurring, true)
    assert.isFalse('refused' in result)
    if ('refused' in result) return
    assert.isNull(result.spawned)
  })

  test('completing a recurring item whose series has ended spawns nothing', async ({ assert }) => {
    const owner = await makeUser('mcp-check-7@example.com')
    const list = await makeListWithCapacity(owner, 'Chores', null)
    const series = await ItemRecurrence.create({
      interval: 1,
      unit: 'week',
      weekdays: JSON.stringify([1]),
      startDate: '2026-09-28',
      endType: 'after',
      endCount: 1,
      occurrencesCreated: 1,
      endDate: null,
    })
    const item = await Item.create({
      listId: list.id,
      name: 'Trash',
      deadline: '2026-09-28',
      recurrenceId: series.id,
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const result = await setItemChecked(list, item, true)
    assert.isFalse('refused' in result)
    if ('refused' in result) return
    assert.isNull(result.spawned)
  })
})
