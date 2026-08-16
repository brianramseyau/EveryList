import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { FavoriteItemDto, ItemDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

let listCounter = 0
async function createList(client: ApiClient, token: string) {
  listCounter += 1
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: `Test List ${listCounter}` })
  return bodyData<ListDto>(response).id
}

test.group('Favorites', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates, lists, updates, deletes, and adds a favorite to its list', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', defaultQuantity: '1 bunch' })
    create.assertStatus(200)
    const favorite = bodyData<FavoriteItemDto>(create)
    const favoriteId = favorite.id
    assert.equal(favorite.listId, listId)

    const index = await client
      .get(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<FavoriteItemDto[]>(index), 1)

    const update = await client
      .patch(`/api/v1/lists/${listId}/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '2 bunches' })
    update.assertStatus(200)
    assert.equal(bodyData<FavoriteItemDto>(update).defaultQuantity, '2 bunches')

    const addToList = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    addToList.assertStatus(200)
    const addedItem = bodyData<ItemDto>(addToList)
    assert.equal(addedItem.name, 'Bananas')
    assert.equal(addedItem.quantity, '2 bunches')
    assert.equal(addedItem.listId, listId)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)
  })

  test('update/destroy honor expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    const favorite = bodyData<FavoriteItemDto & { version: number }>(create)
    assert.equal(favorite.version, 1)

    const unversioned = await client
      .patch(`/api/v1/lists/${listId}/favorites/${favorite.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '1 bunch' })
    unversioned.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(unversioned).version, 2)

    const stale = await client
      .patch(`/api/v1/lists/${listId}/favorites/${favorite.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '2 bunches', expectedVersion: 1 })
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)

    const matching = await client
      .patch(`/api/v1/lists/${listId}/favorites/${favorite.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ defaultQuantity: '3 bunches', expectedVersion: 2 })
    matching.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(matching).version, 3)

    const staleDestroy = await client
      .delete(`/api/v1/lists/${listId}/favorites/${favorite.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 2 })
    staleDestroy.assertStatus(409)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/favorites/${favorite.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 3 })
    destroy.assertStatus(204)
  })

  test('creates a favorite without a default quantity', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bread' })
    create.assertStatus(200)
    assert.isNull(bodyData<FavoriteItemDto>(create).defaultQuantity)
  })

  test('scopes the same favorite name independently to different lists', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const otherListId = await createList(client, token)

    const first = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Marshmallows' })
    first.assertStatus(200)

    const second = await client
      .post(`/api/v1/lists/${otherListId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Marshmallows' })
    second.assertStatus(200)

    const index = await client
      .get(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<FavoriteItemDto[]>(index), 1)
  })

  test('a duplicate favorite name on the same list returns a friendly 422, not a 500', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const first = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    first.assertStatus(200)

    const second = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    second.assertStatus(422)
    assert.equal(second.body().errors[0].message, 'That name is already in use.')
  })

  test('rejects access to a favorite via a list the user does not own', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const otherToken = await signupAndGetToken(client)
    const otherListId = await createList(client, otherToken)

    const response = await client
      .get(`/api/v1/lists/${otherListId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
    response.assertStatus(404)
    assert.isDefined(response.body())
  })

  test('a viewer can list favorites but cannot create, update, delete, or add-to-list', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Bananas' })
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const index = await client
      .get(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)

    const viewerCreate = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Bread' })
    viewerCreate.assertStatus(403)

    const update = await client
      .patch(`/api/v1/lists/${listId}/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ defaultQuantity: '1' })
    update.assertStatus(403)

    const addToList = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${viewer.token}`)
    addToList.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    destroy.assertStatus(403)
  })
})
