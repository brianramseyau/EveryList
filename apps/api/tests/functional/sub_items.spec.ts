import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { ItemDto, ListDto, SubItemDto } from '@everylist/shared'
import { bodyData, signupAndGetToken } from './helpers.js'

// useSubtasks defaults to false server-side (see PLAN_29_PHASE_SUBTASKS.md) — this
// suite is specifically about sub-tasks, so its own list-creation helper opts in.
async function createList(client: ApiClient, token: string, name = 'Test List') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name, useSubtasks: true })
  return bodyData<ListDto>(response).id
}

test.group('Sub-items CRUD and completion gating', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates, lists, updates, reorders, and deletes sub-tasks on an item', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Clean garage' }))
    )

    const first = bodyData<SubItemDto>(
      await auth(
        client.post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`).json({ name: 'Sweep' })
      )
    )
    assert.equal(first.name, 'Sweep')
    assert.isFalse(first.checked)
    assert.equal(first.version, 1)

    const second = bodyData<SubItemDto>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
          .json({ name: 'Hang tools' })
      )
    )
    assert.isAbove(second.sortOrder, first.sortOrder)

    const index = await auth(client.get(`/api/v1/lists/${listId}/items/${item.id}/subtasks`))
    index.assertStatus(200)
    assert.lengthOf(index.body().data, 2)

    // Fetching the item's own list should come back with subItems preloaded.
    const itemsIndex = await auth(client.get(`/api/v1/lists/${listId}/items`))
    const fetchedItem = itemsIndex.body().data.find((row: ItemDto) => row.id === item.id)
    assert.lengthOf(fetchedItem.subItems, 2)

    const rename = bodyData<SubItemDto>(
      await auth(
        client
          .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${first.id}`)
          .json({ name: 'Sweep floor', expectedVersion: 1 })
      )
    )
    assert.equal(rename.name, 'Sweep floor')
    assert.equal(rename.version, 2)

    const move = bodyData<SubItemDto>(
      await auth(
        client
          .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${first.id}/move`)
          .json({ previousSubItemId: second.id, expectedVersion: 2 })
      )
    )
    assert.isAbove(move.sortOrder, second.sortOrder)

    const destroy = await auth(
      client.delete(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${second.id}`)
    )
    destroy.assertStatus(204)

    const afterDelete = await auth(client.get(`/api/v1/lists/${listId}/items/${item.id}/subtasks`))
    assert.lengthOf(afterDelete.body().data, 1)
  })

  test('update/destroy honor expectedVersion — stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Plan trip' }))
    )
    const sub = bodyData<SubItemDto>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
          .json({ name: 'Book flights' })
      )
    )

    const stale = await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub.id}`)
        .json({ checked: true, expectedVersion: 99 })
    )
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)

    const staleDestroy = await auth(
      client
        .delete(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub.id}`)
        .qs({ expectedVersion: 99 })
    )
    staleDestroy.assertStatus(409)
  })

  test('deleting the parent item cascades to its sub-tasks', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Clean garage' }))
    )
    await auth(
      client.post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`).json({ name: 'Sweep' })
    )

    const destroy = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}`))
    destroy.assertStatus(204)

    // Soft-deleting the item scopes it out of `requireItem` (whereNull('deletedAt')),
    // so the nested route 404s — the cascade itself only actually fires on the
    // hard-delete path (`purge`), which removes the item row for real.
    const purge = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}/purge`))
    purge.assertStatus(204)

    const raw = await db.from('sub_items').where('item_id', item.id)
    assert.lengthOf(raw, 0)
  })

  test('blocks checking a parent off while it has open sub-tasks, and unblocks once they are done', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Clean garage' }))
    )
    const sub1 = bodyData<SubItemDto>(
      await auth(
        client.post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`).json({ name: 'Sweep' })
      )
    )
    const sub2 = bodyData<SubItemDto>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
          .json({ name: 'Hang tools' })
      )
    )

    const blocked = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ checked: true })
    )
    blocked.assertStatus(400)
    assert.equal(blocked.body().code, 'subtasks_incomplete')

    await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub1.id}`)
        .json({ checked: true })
    )
    await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub2.id}`)
        .json({ checked: true })
    )

    // Auto-complete defaults to off, so the parent stays open even though every
    // sub-task is now checked...
    const stillOpen = await auth(client.get(`/api/v1/lists/${listId}/items`))
    const fetched = stillOpen.body().data.find((row: ItemDto) => row.id === item.id)
    assert.isFalse(fetched.checked)

    // ...but is now unblocked.
    const unblocked = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ checked: true })
    )
    unblocked.assertStatus(200)
    assert.isTrue(unblocked.body().data.checked)
  })

  test('auto-completes the parent when the last sub-task is checked, only when the list opts in', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    await auth(client.patch(`/api/v1/lists/${listId}`).json({ useSubtaskAutoComplete: true }))

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Plan birthday' }))
    )
    const sub1 = bodyData<SubItemDto>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
          .json({ name: 'Book venue' })
      )
    )
    const sub2 = bodyData<SubItemDto>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`)
          .json({ name: 'Send invites' })
      )
    )

    await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub1.id}`)
        .json({ checked: true })
    )
    const stillOpen = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.isFalse(
      stillOpen.body().data.find((row: ItemDto) => row.id === item.id).checked,
      'parent should not auto-complete before the last sub-task is checked'
    )

    await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}/subtasks/${sub2.id}`)
        .json({ checked: true })
    )
    const afterLast = await auth(client.get(`/api/v1/lists/${listId}/items`))
    const fetched = afterLast.body().data.find((row: ItemDto) => row.id === item.id)
    assert.isTrue(fetched.checked, 'parent should auto-complete once every sub-task is checked')
  })

  test('disables sub-task completion gating entirely when useSubtasks is off', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const item = bodyData<ItemDto>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Clean garage' }))
    )
    await auth(
      client.post(`/api/v1/lists/${listId}/items/${item.id}/subtasks`).json({ name: 'Sweep' })
    )

    await auth(client.patch(`/api/v1/lists/${listId}`).json({ useSubtasks: false }))

    const check = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ checked: true })
    )
    check.assertStatus(200)
    assert.isTrue(check.body().data.checked)
  })
})
