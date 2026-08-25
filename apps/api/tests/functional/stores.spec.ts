import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { CategoryDto, ListDto, StoreDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

interface StoreCategoryOrderDto {
  id: number
  storeId: number
  categoryId: number
  sortOrder: number
  version: number
}

let listCounter = 0
async function createList(client: ApiClient, token: string) {
  listCounter += 1
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: `Test List ${listCounter}` })
  return bodyData<ListDto>(response).id
}

async function createCategory(client: ApiClient, token: string, listId: number, name: string) {
  const response = await client
    .post(`/api/v1/lists/${listId}/categories`)
    .header('Authorization', `Bearer ${token}`)
    .json({ name, icon: 'basket' })
  return bodyData<CategoryDto>(response).id
}

test.group('Stores', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates a store attached to a list, renames it, and reorders its categories', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categoryId = await createCategory(client, token, listId, 'Produce')

    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Walmart' })
    create.assertStatus(200)
    const createdStore = bodyData<StoreDto>(create)
    const storeId = createdStore.id
    assert.equal(createdStore.name, 'Walmart')

    const index = await client
      .get(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<StoreDto[]>(index), 1)

    const reorder = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ categories: [{ categoryId, sortOrder: 5 }] })
    reorder.assertStatus(200)
    assert.equal(bodyData<StoreCategoryOrderDto[]>(reorder)[0]!.sortOrder, 5)
    assert.equal(bodyData<StoreCategoryOrderDto[]>(reorder)[0]!.version, 1)

    // Reordering the same category again updates (rather than duplicates)
    // its existing StoreCategoryOrder row, bumping its version.
    const reorderAgain = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ categories: [{ categoryId, sortOrder: 9 }] })
    reorderAgain.assertStatus(200)
    assert.equal(bodyData<StoreCategoryOrderDto[]>(reorderAgain)[0]!.sortOrder, 9)
    assert.equal(bodyData<StoreCategoryOrderDto[]>(reorderAgain)[0]!.version, 2)

    const reset = await client
      .delete(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    reset.assertStatus(204)

    const afterReset = await client
      .get(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    afterReset.assertStatus(200)
    assert.lengthOf(bodyData<StoreCategoryOrderDto[]>(afterReset), 0)

    const rename = await client
      .patch(`/api/v1/stores/${storeId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Walmart Supercenter' })
    rename.assertStatus(200)
    assert.equal(bodyData<StoreDto>(rename).name, 'Walmart Supercenter')

    const detach = await client
      .delete(`/api/v1/lists/${listId}/stores/${storeId}`)
      .header('Authorization', `Bearer ${token}`)
    detach.assertStatus(204)

    const afterDetach = await client
      .get(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(bodyData<StoreDto[]>(afterDetach), 0)
  })

  test('update honors expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Walmart' })
    const store = bodyData<StoreDto & { version: number }>(create)
    assert.equal(store.version, 1)

    const unversioned = await client
      .patch(`/api/v1/stores/${store.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#ff0000' })
    unversioned.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(unversioned).version, 2)

    const stale = await client
      .patch(`/api/v1/stores/${store.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#00ff00', expectedVersion: 1 })
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)

    const matching = await client
      .patch(`/api/v1/stores/${store.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ color: '#00ff00', expectedVersion: 2 })
    matching.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(matching).version, 3)
  })

  test('attaching an existing store by id shares it across lists', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listA = await createList(client, token)
    const listB = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listA}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Costco' })
    const storeId = bodyData<StoreDto>(create).id

    const attach = await client
      .post(`/api/v1/lists/${listB}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ storeId })
    attach.assertStatus(200)
    assert.equal(bodyData<StoreDto>(attach).id, storeId)
  })

  test('fetches a store category order and rejects attach without storeId or name', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Aldi' })
    const storeId = bodyData<StoreDto>(create).id

    const categories = await client
      .get(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    categories.assertStatus(200)
    assert.isArray(bodyData<StoreCategoryOrderDto[]>(categories))

    const badAttach = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({})
    badAttach.assertStatus(400)
  })

  test('reordering categories silently skips ids that do not exist', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categoryId = await createCategory(client, token, listId, 'Produce')

    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Kroger' })
    const storeId = bodyData<StoreDto>(create).id

    const bogusCategoryId = 999_999

    const reorder = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({
        categories: [
          { categoryId, sortOrder: 3 },
          { categoryId: bogusCategoryId, sortOrder: 7 },
        ],
      })
    reorder.assertStatus(200)
    const orders = bodyData<StoreCategoryOrderDto[]>(reorder)
    assert.lengthOf(orders, 1)
    assert.equal(orders[0]!.categoryId, categoryId)
  })

  test('a viewer can see stores but cannot attach, rename, detach, or reorder categories', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Walmart' })
    const storeId = bodyData<StoreDto>(create).id

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)

    const attach = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Target' })
    attach.assertStatus(403)

    const rename = await client
      .patch(`/api/v1/stores/${storeId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Hijacked' })
    rename.assertStatus(403)

    const reorder = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ categories: [] })
    reorder.assertStatus(403)

    const resetCategories = await client
      .delete(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${viewer.token}`)
    resetCategories.assertStatus(403)

    const detach = await client
      .delete(`/api/v1/lists/${listId}/stores/${storeId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    detach.assertStatus(403)
  })

  test('a stranger gets a 404 trying to read or write a store', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const create = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Walmart' })
    const storeId = bodyData<StoreDto>(create).id

    const stranger = await signupAndGetUser(client)

    const categories = await client
      .get(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${stranger.token}`)
    categories.assertStatus(404)

    const attachByStoreId = await client
      .post(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ storeId })
    attachByStoreId.assertStatus(404)
  })
})
