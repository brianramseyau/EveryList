import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient } from '@japa/api-client'
import DefaultCategorySeeder from '#database/seeders/default_category_seeder'
import { signupAndGetToken } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return response.body().data.id as number
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
    const storeId = create.body().data.id
    assert.equal(create.body().data.name, 'Walmart')

    const index = await client
      .get(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(index.body().data, 1)

    const categories = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const categoryId = categories.body().data[0].id

    const reorder = await client
      .patch(`/api/v1/stores/${storeId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ categories: [{ categoryId, sortOrder: 5 }] })
    reorder.assertStatus(200)
    assert.equal(reorder.body().data[0].sortOrder, 5)

    const rename = await client
      .patch(`/api/v1/stores/${storeId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Walmart Supercenter' })
    rename.assertStatus(200)
    assert.equal(rename.body().data.name, 'Walmart Supercenter')

    const detach = await client
      .delete(`/api/v1/lists/${listId}/stores/${storeId}`)
      .header('Authorization', `Bearer ${token}`)
    detach.assertStatus(204)

    const afterDetach = await client
      .get(`/api/v1/lists/${listId}/stores`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(afterDetach.body().data, 0)
  })

  test('attaching an existing store by id shares it across lists', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listA = await createList(client, token)
    const listB = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listA}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Costco' })
    const storeId = create.body().data.id

    const attach = await client
      .post(`/api/v1/lists/${listB}/stores`)
      .header('Authorization', `Bearer ${token}`)
      .json({ storeId })
    attach.assertStatus(200)
    assert.equal(attach.body().data.id, storeId)
  })
})
