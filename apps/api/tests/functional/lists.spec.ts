import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ListDto } from '@everylist/shared'
import { bodyData, signupAndGetToken } from './helpers.js'

test.group('Lists CRUD', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/lists')
    response.assertStatus(401)
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

    const index = await authed()
    index.assertStatus(200)
    assert.lengthOf(bodyData<ListDto[]>(index), 1)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Weekly Groceries', archived: true })
    update.assertStatus(200)
    const updatedList = bodyData<ListDto>(update)
    assert.equal(updatedList.name, 'Weekly Groceries')
    assert.isTrue(updatedList.archived)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const showDeleted = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    showDeleted.assertStatus(404)
  })

  test("a user cannot see another user's list", async ({ client }) => {
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
  })
})
