import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import { signupAndGetToken } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return response.body().data.id as number
}

test.group('Favorites', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates, lists, updates, deletes, and adds a favorite to a list', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post('/api/v1/favorites')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', defaultQuantity: '1 bunch' })
    create.assertStatus(200)
    const favoriteId = create.body().data.id

    const index = await client.get('/api/v1/favorites').header('Authorization', `Bearer ${token}`)
    assert.lengthOf(index.body().data, 1)

    const update = await client
      .patch(`/api/v1/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '2 bunches' })
    update.assertStatus(200)
    assert.equal(update.body().data.defaultQuantity, '2 bunches')

    const addToList = await client
      .post(`/api/v1/favorites/${favoriteId}/add-to-list/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    addToList.assertStatus(200)
    assert.equal(addToList.body().data.name, 'Bananas')
    assert.equal(addToList.body().data.quantity, '2 bunches')
    assert.equal(addToList.body().data.listId, listId)

    const destroy = await client
      .delete(`/api/v1/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)
  })
})
