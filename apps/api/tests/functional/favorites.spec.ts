import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { FavoriteItemDto, ItemDto, ListDto } from '@everylist/shared'
import { bodyData, signupAndGetToken } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return bodyData<ListDto>(response).id
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
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const index = await client.get('/api/v1/favorites').header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<FavoriteItemDto[]>(index), 1)

    const update = await client
      .patch(`/api/v1/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '2 bunches' })
    update.assertStatus(200)
    assert.equal(bodyData<FavoriteItemDto>(update).defaultQuantity, '2 bunches')

    const addToList = await client
      .post(`/api/v1/favorites/${favoriteId}/add-to-list/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    addToList.assertStatus(200)
    const addedItem = bodyData<ItemDto>(addToList)
    assert.equal(addedItem.name, 'Bananas')
    assert.equal(addedItem.quantity, '2 bunches')
    assert.equal(addedItem.listId, listId)

    const destroy = await client
      .delete(`/api/v1/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)
  })

  test('creates a favorite without a default quantity', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/favorites')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bread' })
    create.assertStatus(200)
    assert.isNull(bodyData<FavoriteItemDto>(create).defaultQuantity)
  })
})
