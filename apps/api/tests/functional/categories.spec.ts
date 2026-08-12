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

test.group('Categories', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('lists effective categories merging list overrides with global defaults', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    assert.lengthOf(index.body().data, 8)
    assert.equal(index.body().data[0].name, 'Produce')
  })

  test('creating a custom category adds it to the list', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    create.assertStatus(200)
    assert.equal(create.body().data.listId, listId)
    assert.isFalse(create.body().data.isDefault)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    assert.lengthOf(index.body().data, 9)
  })

  test('renaming a global default forks it into a list-scoped override', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const produce = index.body().data.find((c: { name: string }) => c.name === 'Produce')

    const rename = await client
      .patch(`/api/v1/lists/${listId}/categories/${produce.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Fruit & Veg' })
    rename.assertStatus(200)
    assert.equal(rename.body().data.listId, listId)
    assert.notEqual(rename.body().data.id, produce.id)

    // The global default is untouched for other lists.
    const globalCheck = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const names = globalCheck.body().data.map((c: { name: string }) => c.name)
    assert.include(names, 'Fruit & Veg')
    assert.notInclude(names, 'Produce')
  })

  test('reordering categories persists the new sort order', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const ids = index.body().data.map((c: { id: number }) => c.id)
    const reversed = [...ids].reverse()

    const reorder = await client
      .patch(`/api/v1/lists/${listId}/categories/reorder`)
      .header('Authorization', `Bearer ${token}`)
      .json({ order: reversed })
    reorder.assertStatus(200)

    const originalFirstName = index.body().data[0].name
    const newLastName = reorder.body().data.at(-1).name
    assert.equal(originalFirstName, newLastName)
  })
})
