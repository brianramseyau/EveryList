import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient } from '@japa/api-client'
import type { CategoryDto, ListDto, StoreDto } from '@everylist/shared'
import DefaultCategorySeeder from '#database/seeders/default_category_seeder'
import { bodyData, signupAndGetToken } from './helpers.js'

interface StoreCategoryOrderDto {
  id: number
  storeId: number
  categoryId: number
  sortOrder: number
}

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return bodyData<ListDto>(response).id
}

test.group('Stores', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates a store attached to a list, renames it, and reorders its categories', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

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

    const categories = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const categoryId = bodyData<CategoryDto[]>(categories)[0]!.id

    const reorder = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ categories: [{ categoryId, sortOrder: 5 }] })
    reorder.assertStatus(200)
    assert.equal(bodyData<StoreCategoryOrderDto[]>(reorder)[0]!.sortOrder, 5)

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
})
