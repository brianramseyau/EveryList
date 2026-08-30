import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ListDto } from '@everylist/shared'
import List from '#models/list'
import { bodyData, signupAndGetUser } from './helpers.js'

type PreferenceBody = { defaultListId: number | null; showChecked: boolean }

test.group('Alexa preferences', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const show = await client.get('/api/v1/alexa/preferences')
    show.assertStatus(401)

    const update = await client.patch('/api/v1/alexa/preferences').json({ showChecked: false })
    update.assertStatus(401)
  })

  test('defaults to no default list and showChecked true when never set', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const response = await client
      .get('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
    response.assertStatus(200)
    assert.deepEqual(bodyData<PreferenceBody>(response), { defaultListId: null, showChecked: true })
  })

  test('updates showChecked and defaultListId, and persists across requests', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const listId = bodyData<ListDto>(create).id

    const update = await client
      .patch('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ defaultListId: listId, showChecked: false })
    update.assertStatus(200)
    assert.deepEqual(bodyData<PreferenceBody>(update), {
      defaultListId: listId,
      showChecked: false,
    })

    const show = await client
      .get('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
    assert.deepEqual(bodyData<PreferenceBody>(show), { defaultListId: listId, showChecked: false })
  })

  test('a partial update leaves the other field untouched', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const listId = bodyData<ListDto>(create).id

    await client
      .patch('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ defaultListId: listId })

    const response = await client
      .patch('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ showChecked: false })
    assert.deepEqual(bodyData<PreferenceBody>(response), {
      defaultListId: listId,
      showChecked: false,
    })
  })

  test('hard-deleting the default list clears defaultListId but leaves showChecked untouched', async ({
    client,
    assert,
  }) => {
    // `DELETE /api/v1/lists/:id` only soft-deletes (sets `deletedAt`) — nothing in this codebase
    // ever hard-deletes a `lists` row today, so `default_list_id`'s FK action never fires through
    // any real app flow yet. This exercises the FK contract directly (bypassing the app layer,
    // the way a future purge feature — mirroring items' own retention prune — eventually would)
    // to prove the schema itself does the right thing: `SET NULL`, not `CASCADE`.
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const listId = bodyData<ListDto>(create).id

    await client
      .patch('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ defaultListId: listId, showChecked: false })

    await List.query().where('id', listId).delete()

    const response = await client
      .get('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
    // The list row is gone, so defaultListId is cleared — but showChecked, on the same row,
    // survives (an `ON DELETE CASCADE` on this column would have deleted the whole row instead,
    // silently resetting showChecked back to the default too).
    assert.deepEqual(bodyData<PreferenceBody>(response), {
      defaultListId: null,
      showChecked: false,
    })
  })

  test('rejects a defaultListId the user cannot see', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const stranger = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ name: 'Not yours' })
    const otherListId = bodyData<ListDto>(create).id

    const response = await client
      .patch('/api/v1/alexa/preferences')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ defaultListId: otherListId })
    response.assertStatus(404)
  })
})
