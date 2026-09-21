import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import type { ItemDto, ListDto, SubItemDto } from '@everylist/shared'
import Item from '#models/item'
import ItemRecurrence from '#models/item_recurrence'
import SyncEvent from '#models/sync_event'
import { todayLocalIso } from '#services/deadline_notification_service'
import { bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

// A far-future anchor so the "late completion rolls forward to today" rule never interferes,
// except in the test that wants it to.
const FUTURE = '2099-01-05'

const daily = {
  interval: 1,
  unit: 'day' as const,
  weekdays: [],
  startDate: FUTURE,
  end: { type: 'never' as const },
}

async function occurrencesCreated() {
  const series = await ItemRecurrence.firstOrFail()
  return series.occurrencesCreated
}

async function isChecked(itemId: number) {
  const row = await Item.findOrFail(itemId)
  return row.checked
}

async function createList(client: ApiClient, token: string, extra: object = {}) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Chores', ...extra })
  return bodyData<ListDto>(response).id
}

async function createItem(
  client: ApiClient,
  token: string,
  listId: number,
  body: Record<string, unknown>
) {
  return client
    .post(`/api/v1/lists/${listId}/items`)
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Take out bins', ...body })
}

async function patchItem(
  client: ApiClient,
  token: string,
  listId: number,
  itemId: number,
  body: Record<string, unknown>
) {
  return client
    .patch(`/api/v1/lists/${listId}/items/${itemId}`)
    .header('Authorization', `Bearer ${token}`)
    .json(body)
}

test.group('Recurring items (PLAN_30_PHASE_RECURRING_ITEMS.md)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates an item with a repeat rule and round-trips it on index', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await createItem(client, token, listId, {
      deadline: `${FUTURE}T09:00`,
      recurrence: {
        interval: 2,
        unit: 'week',
        weekdays: [4, 1, 1],
        startDate: FUTURE,
        end: { type: 'after', count: 5 },
      },
    })
    create.assertStatus(200)
    const item = bodyData<ItemDto>(create)
    assert.equal(item.recurrence?.interval, 2)
    // De-duplicated and sorted.
    assert.deepEqual(item.recurrence?.weekdays, [1, 4])
    assert.deepEqual(item.recurrence?.end, { type: 'after', count: 5 })
    assert.equal(item.recurrence?.occurrence, 1)

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
    const listed = bodyData<ItemDto[]>(index)[0]!
    assert.equal(listed.recurrence?.id, item.recurrence?.id)
  })

  test('items without a repeat report recurrence null on index', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await createItem(client, token, listId, { deadline: FUTURE })

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
    assert.isNull(bodyData<ItemDto[]>(index)[0]!.recurrence)
  })

  test('round-trips month rules and end dates through storage', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const nth = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        name: 'Last Friday',
        deadline: FUTURE,
        recurrence: {
          ...daily,
          unit: 'month',
          monthly: { kind: 'nthWeekday', nth: -1, weekday: 5 },
          end: { type: 'on', date: '2100-01-01' },
        },
      })
    )
    assert.deepEqual(nth.recurrence?.monthly, { kind: 'nthWeekday', nth: -1, weekday: 5 })
    assert.deepEqual(nth.recurrence?.end, { type: 'on', date: '2100-01-01' })

    const dom = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        name: 'The 21st',
        deadline: FUTURE,
        recurrence: { ...daily, unit: 'month', monthly: { kind: 'dayOfMonth', day: 21 } },
      })
    )
    assert.deepEqual(dom.recurrence?.monthly, { kind: 'dayOfMonth', day: 21 })
    assert.deepEqual(dom.recurrence?.end, { type: 'never' })

    const plain = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        name: 'Anchor day',
        deadline: FUTURE,
        recurrence: { ...daily, unit: 'month' },
      })
    )
    assert.isNull(plain.recurrence?.monthly)
  })

  test('rejects a repeat rule without a deadline', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await createItem(client, token, listId, { recurrence: daily })
    create.assertStatus(422)

    const item = bodyData<ItemDto>(await createItem(client, token, listId, { name: 'Plain' }))
    const update = await patchItem(client, token, listId, item.id, { recurrence: daily })
    update.assertStatus(422)

    // An inconsistent rule is rejected on update too, even when the item has a deadline.
    const dated = bodyData<ItemDto>(
      await createItem(client, token, listId, { name: 'Dated', deadline: FUTURE })
    )
    const inconsistent = await patchItem(client, token, listId, dated.id, {
      recurrence: { ...daily, weekdays: [1] },
    })
    inconsistent.assertStatus(422)
  })

  test('rejects rules that are internally inconsistent', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const bad: Array<[string, object, RegExp]> = [
      ['weekdays on a day rule', { ...daily, weekdays: [1] }, /weekly/],
      [
        'month day missing',
        { ...daily, unit: 'month', monthly: { kind: 'dayOfMonth' } },
        /day of the month/,
      ],
      [
        'nth weekday incomplete',
        { ...daily, unit: 'month', monthly: { kind: 'nthWeekday', nth: 0, weekday: 1 } },
        /week of the month/,
      ],
      ['end date missing', { ...daily, end: { type: 'on' } }, /end date/],
      ['end count missing', { ...daily, end: { type: 'after' } }, /occurrences/],
      ['end before start', { ...daily, end: { type: 'on', date: '2098-01-01' } }, /end date/],
    ]
    for (const [label, recurrence, message] of bad) {
      const response = await createItem(client, token, listId, {
        name: label,
        deadline: FUTURE,
        recurrence,
      })
      response.assertStatus(422)
      assert.match(response.body().message, message, label)
    }
  })

  test('checking a repeating item spawns the next one at the same time of day', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        deadline: `${FUTURE}T09:30`,
        quantity: '2',
        notes: 'Blue bin too',
        recurrence: daily,
      })
    )

    const check = await patchItem(client, token, listId, item.id, {
      checked: true,
      expectedVersion: item.version,
    })
    check.assertStatus(200)
    assert.isTrue(bodyData<ItemDto>(check).checked)

    const items = await Item.query().where('listId', listId).orderBy('id', 'asc')
    assert.lengthOf(items, 2)
    const [done, next] = items as [Item, Item]
    assert.isTrue(done.checked)
    assert.isFalse(next.checked)
    assert.equal(next.deadline, '2099-01-06T09:30')
    assert.equal(next.name, 'Take out bins')
    assert.equal(next.quantity, '2')
    assert.equal(next.notes, 'Blue bin too')
    assert.equal(next.recurrenceId, done.recurrenceId)

    const series = await ItemRecurrence.findOrFail(done.recurrenceId!)
    assert.equal(series.occurrencesCreated, 2)

    const events = await SyncEvent.query().where('listId', listId).where('entityType', 'item')
    assert.isTrue(events.some((e) => e.entityId === next.id && e.op === 'create'))
    assert.isTrue(events.some((e) => e.entityId === done.id && e.op === 'update'))
  })

  test('a date-only deadline spawns a date-only next item', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, item.id, { checked: true })

    const next = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    assert.equal(next.deadline, '2099-01-06')
  })

  test('a late completion rolls the next item forward to today instead of the past', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        deadline: '2020-01-01',
        recurrence: { ...daily, startDate: '2020-01-01' },
      })
    )
    await patchItem(client, token, listId, item.id, { checked: true })

    const next = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    assert.equal(next.deadline, todayLocalIso(DateTime.now()))
  })

  test('copies sub-tasks, unchecked, onto the next item', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token, { useSubtasks: true })
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    const sub = bodyData<SubItemDto>(
      await client
        .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
        .header('Authorization', `Bearer ${token}`)
        .json({ name: 'Rinse bins' })
    )
    await client
      .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ checked: true })

    const check = await patchItem(client, token, listId, item.id, { checked: true })
    check.assertStatus(200)

    const next = await Item.query()
      .where('listId', listId)
      .where('checked', false)
      .preload('subItems')
      .firstOrFail()
    assert.lengthOf(next.subItems, 1)
    assert.equal(next.subItems[0]!.name, 'Rinse bins')
    assert.isFalse(next.subItems[0]!.checked)
  })

  test('stops spawning once "after N occurrences" is reached', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        deadline: FUTURE,
        recurrence: { ...daily, end: { type: 'after', count: 2 } },
      })
    )
    await patchItem(client, token, listId, item.id, { checked: true })
    const second = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    await patchItem(client, token, listId, second.id, { checked: true })

    const all = await Item.query().where('listId', listId)
    assert.lengthOf(all, 2)
    assert.isTrue(all.every((row) => row.checked))
  })

  test('stops spawning after the end date', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        deadline: FUTURE,
        recurrence: { ...daily, end: { type: 'on', date: FUTURE } },
      })
    )
    await patchItem(client, token, listId, item.id, { checked: true })
    assert.lengthOf(await Item.query().where('listId', listId), 1)
  })

  test('unchecking a completed repeating item undoes it: the spawned copy is discarded', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, item.id, { checked: true })
    const copy = await Item.query().where('listId', listId).where('checked', false).firstOrFail()

    const undo = await patchItem(client, token, listId, item.id, { checked: false })
    undo.assertStatus(200)
    assert.isFalse(bodyData<ItemDto>(undo).checked)

    // Exactly one open item in the series again; the copy is soft-deleted and detached so
    // restoring or re-adding it can't bring back a second repeating item.
    const open = await Item.query().where('listId', listId).whereNull('deletedAt')
    assert.deepEqual(
      open.map((row) => row.id),
      [item.id]
    )
    const discarded = await Item.findOrFail(copy.id)
    assert.isNotNull(discarded.deletedAt)
    assert.isNull(discarded.recurrenceId)
    assert.equal(await occurrencesCreated(), 1)

    const events = await SyncEvent.query().where('listId', listId).where('entityType', 'item')
    assert.isTrue(events.some((e) => e.entityId === copy.id && e.op === 'delete'))

    // Completing it again spawns a fresh copy, so the count and the series stay consistent.
    await patchItem(client, token, listId, item.id, { checked: true })
    const next = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    assert.equal(next.deadline, '2099-01-06')
    assert.equal(await occurrencesCreated(), 2)
  })

  test('undo works even when the list is at its open-item limit', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token, { maxUncheckedItems: 1 })
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, item.id, { checked: true })

    // The copy fills the only slot; the discard frees it for the reopened row.
    const undo = await patchItem(client, token, listId, item.id, { checked: false })
    undo.assertStatus(200)
    assert.lengthOf(await Item.query().where('listId', listId).whereNull('deletedAt'), 1)
  })

  test('refuses to reopen an older occurrence once a later one is open', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const first = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, first.id, { checked: true })
    const second = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    await patchItem(client, token, listId, second.id, { checked: true })

    const refused = await patchItem(client, token, listId, first.id, { checked: false })
    refused.assertStatus(422)
    assert.match(refused.body().message, /open occurrence/)
    assert.isTrue(await isChecked(first.id))

    // The most recent completed occurrence can still be undone.
    const undo = await patchItem(client, token, listId, second.id, { checked: false })
    undo.assertStatus(200)
  })

  test('uncheck is a plain reopen when the series has no open successor', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, {
        deadline: FUTURE,
        recurrence: { ...daily, end: { type: 'after', count: 1 } },
      })
    )
    await patchItem(client, token, listId, item.id, { checked: true })
    assert.lengthOf(await Item.query().where('listId', listId), 1)

    const reopen = await patchItem(client, token, listId, item.id, { checked: false })
    reopen.assertStatus(200)
    assert.isFalse(await isChecked(item.id))
  })

  test('editing the rule updates the shared series row', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )

    const update = await patchItem(client, token, listId, item.id, {
      recurrence: { ...daily, interval: 3 },
    })
    update.assertStatus(200)
    const updated = bodyData<ItemDto>(update)
    assert.equal(updated.recurrence?.id, item.recurrence?.id)
    assert.equal(updated.recurrence?.interval, 3)
    assert.lengthOf(await ItemRecurrence.all(), 1)

    await patchItem(client, token, listId, item.id, { checked: true })
    const next = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    assert.equal(next.deadline, '2099-01-08')
  })

  test('null stops repeating; checking then spawns nothing', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )

    const stop = await patchItem(client, token, listId, item.id, { recurrence: null })
    assert.isNull(bodyData<ItemDto>(stop).recurrence)

    await patchItem(client, token, listId, item.id, { checked: true })
    assert.lengthOf(await Item.query().where('listId', listId), 1)
  })

  test('clearing the deadline stops repeating', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )

    const clear = await patchItem(client, token, listId, item.id, { deadline: null })
    const cleared = bodyData<ItemDto>(clear)
    assert.isNull(cleared.deadline)
    assert.isNull(cleared.recurrence)
  })

  test('re-adding the name of a completed repeating item returns the open copy', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, item.id, { checked: true })
    const open = await Item.query().where('listId', listId).where('checked', false).firstOrFail()

    const readd = await createItem(client, token, listId, {})
    assert.equal(bodyData<ItemDto>(readd).id, open.id)
    // The completed history row was not reactivated.
    const history = await Item.findOrFail(item.id)
    assert.isTrue(history.checked)
  })

  test('a repeat rule can only be changed on an open item, not a checked history row', async ({
    client,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    await patchItem(client, token, listId, item.id, { checked: true })

    const edit = await patchItem(client, token, listId, item.id, {
      recurrence: { ...daily, interval: 3 },
    })
    edit.assertStatus(422)
    // Checking and re-ruling in one request is the same thing.
    const open = await Item.query().where('listId', listId).where('checked', false).firstOrFail()
    const both = await patchItem(client, token, listId, open.id, {
      checked: true,
      recurrence: { ...daily, interval: 3 },
    })
    both.assertStatus(422)
  })

  test('two simultaneous check-offs spawn exactly one next item', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )

    const responses = await Promise.all([
      patchItem(client, token, listId, item.id, { checked: true }),
      patchItem(client, token, listId, item.id, { checked: true }),
    ])
    for (const response of responses) response.assertStatus(200)

    assert.lengthOf(await Item.query().where('listId', listId), 2)
    const series = await ItemRecurrence.firstOrFail()
    assert.equal(series.occurrencesCreated, 2)
  })

  test('single-item responses carry the repeat rule (recent, restore, re-add, move)', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const otherListId = await createList(client, token, { name: 'Other chores' })
    const item = bodyData<ItemDto>(
      await createItem(client, token, listId, { deadline: FUTURE, recurrence: daily })
    )
    const auth = { Authorization: `Bearer ${token}` }

    await client.delete(`/api/v1/lists/${listId}/items/${item.id}`).headers(auth)
    const recent = await client.get(`/api/v1/lists/${listId}/items/recent`).headers(auth)
    assert.equal(bodyData<ItemDto[]>(recent)[0]!.recurrence?.id, item.recurrence?.id)

    const restore = await client
      .post(`/api/v1/lists/${listId}/items/${item.id}/restore`)
      .headers(auth)
    assert.equal(bodyData<ItemDto>(restore).recurrence?.id, item.recurrence?.id)

    const readd = await createItem(client, token, listId, {})
    assert.equal(bodyData<ItemDto>(readd).recurrence?.id, item.recurrence?.id)

    await client.delete(`/api/v1/lists/${listId}/items/${item.id}`).headers(auth)
    const restoredByName = await createItem(client, token, listId, {})
    assert.equal(bodyData<ItemDto>(restoredByName).recurrence?.id, item.recurrence?.id)

    const move = await client
      .patch(`/api/v1/lists/${listId}/items/${item.id}/move`)
      .headers(auth)
      .json({ previousItemId: null })
    assert.equal(bodyData<ItemDto>(move).recurrence?.id, item.recurrence?.id)

    const moveToList = await client
      .post(`/api/v1/lists/${listId}/items/${item.id}/move-to-list`)
      .headers(auth)
      .json({ destinationListId: otherListId })
    assert.equal(bodyData<ItemDto>(moveToList).recurrence?.id, item.recurrence?.id)
  })

  test('rejects out-of-range rule values at the validator', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const bad: object[] = [
      { ...daily, end: { type: 'after', count: 0 } },
      { ...daily, end: { type: 'after', count: 1000 } },
      { ...daily, unit: 'month', monthly: { kind: 'dayOfMonth', day: 32 } },
      { ...daily, unit: 'month', monthly: { kind: 'nthWeekday', nth: 1, weekday: 9 } },
      { ...daily, interval: 0 },
    ]
    for (const recurrence of bad) {
      const response = await createItem(client, token, listId, { deadline: FUTURE, recurrence })
      response.assertStatus(422)
    }
  })

  test('a name-based add picks the oldest of several open same-name rows', async ({
    client,
    assert,
  }) => {
    const { token, id: userId } = await signupAndGetUser(client)
    const listId = await createList(client, token)
    // Legacy duplicates from before the by-name lookup existed.
    const rows = []
    for (const sortOrder of [1, 2]) {
      rows.push(
        await Item.create({
          listId,
          name: 'Take out bins',
          checked: false,
          sortOrder,
          createdBy: userId,
          version: 1,
        })
      )
    }

    const readd = await createItem(client, token, listId, {})
    assert.equal(bodyData<ItemDto>(readd).id, rows[0]!.id)
  })

  test('a non-repeating item still checks without spawning', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const item = bodyData<ItemDto>(await createItem(client, token, listId, { deadline: FUTURE }))
    await patchItem(client, token, listId, item.id, { checked: true })
    assert.lengthOf(await Item.query().where('listId', listId), 1)
  })
})
