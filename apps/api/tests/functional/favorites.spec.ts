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

  test('creating a favorite with an already-live duplicate name updates it in place instead of erroring', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const first = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', defaultQuantity: '1 bunch' })
    first.assertStatus(200)
    const firstFavorite = bodyData<FavoriteItemDto>(first)

    const second = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', defaultQuantity: '2 bunches', notes: 'Ripe ones', price: 250 })
    second.assertStatus(200)
    const secondFavorite = bodyData<FavoriteItemDto>(second)
    assert.equal(secondFavorite.id, firstFavorite.id)
    assert.equal(secondFavorite.defaultQuantity, '2 bunches')
    assert.equal(secondFavorite.notes, 'Ripe ones')
    assert.equal(secondFavorite.price, 250)

    const index = await client
      .get(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<FavoriteItemDto[]>(index), 1)
  })

  test('deleting a favorite then re-adding it by the same name un-deletes it instead of erroring', async ({
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
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/favorites/${favoriteId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const recreate = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    recreate.assertStatus(200)
    const recreated = bodyData<FavoriteItemDto>(recreate)
    assert.equal(recreated.id, favoriteId)
    assert.isNull(recreated.deletedAt)
    assert.isNull(recreated.defaultQuantity)

    const index = await client
      .get(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<FavoriteItemDto[]>(index), 1)
  })

  test('adding a favorite already on the list as an unchecked item is a no-op', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const first = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    first.assertStatus(200)
    const firstItem = bodyData<ItemDto>(first)

    const second = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    second.assertStatus(200)
    const secondItem = bodyData<ItemDto>(second)
    assert.equal(secondItem.id, firstItem.id)

    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<ItemDto[]>(items), 1)
  })

  test('adding a favorite already on the list as a checked item un-checks it instead of duplicating', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const added = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    const item = bodyData<ItemDto>(added)

    const checked = await client
      .patch(`/api/v1/lists/${listId}/items/${item.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ checked: true })
    checked.assertStatus(200)

    const readded = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    readded.assertStatus(200)
    const readdedItem = bodyData<ItemDto>(readded)
    assert.equal(readdedItem.id, item.id)
    assert.isFalse(readdedItem.checked)

    const items = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<ItemDto[]>(items), 1)
  })

  test('addToList carries the favorite store, notes, and price onto the new item', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const store = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Corner Shop', color: '#123456' })
    const storeId = bodyData<{ id: number }>(store).id

    const create = await client
      .post(`/api/v1/lists/${listId}/favorites`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas', storeId, notes: 'Ripe ones', price: 250 })
    create.assertStatus(200)
    const favoriteId = bodyData<FavoriteItemDto>(create).id

    const addToList = await client
      .post(`/api/v1/lists/${listId}/favorites/${favoriteId}/add-to-list`)
      .header('Authorization', `Bearer ${token}`)
    addToList.assertStatus(200)
    const item = bodyData<ItemDto>(addToList)
    assert.equal(item.storeId, storeId)
    assert.equal(item.notes, 'Ripe ones')
    assert.equal(item.price, 250)
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
