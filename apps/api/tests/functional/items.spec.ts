import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import DefaultCategorySeeder from '#database/seeders/default_category_seeder'
import { bodyData, signupAndGetToken } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Groceries' })
  return bodyData<ListDto>(response).id
}

test.group('Items CRUD', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates an item with auto-categorization, updates, checks, and soft-deletes it', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Bananas', quantity: '2' })
    )
    create.assertStatus(200)
    const item = create.body().data
    assert.equal(item.name, 'Bananas')
    assert.equal(item.quantity, '2')
    assert.isFalse(item.checked)
    assert.isNotNull(item.categoryId, 'expected auto-categorization to assign a Produce category')

    const index = await auth(client.get(`/api/v1/lists/${listId}/items`))
    index.assertStatus(200)
    assert.lengthOf(index.body().data, 1)

    const check = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ checked: true })
    )
    check.assertStatus(200)
    assert.isTrue(check.body().data.checked)
    assert.isString(check.body().data.checkedAt)

    const destroy = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}`))
    destroy.assertStatus(204)

    const afterDelete = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.lengthOf(afterDelete.body().data, 0)

    const recent = await auth(client.get(`/api/v1/lists/${listId}/items/recent`))
    recent.assertStatus(200)
    assert.lengthOf(recent.body().data, 1)

    const restore = await auth(client.post(`/api/v1/lists/${listId}/items/${item.id}/restore`))
    restore.assertStatus(200)

    const afterRestore = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.lengthOf(afterRestore.body().data, 1)
  })

  test('bulk import splits pasted text into items', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const response = await client
      .post(`/api/v1/lists/${listId}/items/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ text: 'Milk\nBread\n\nChicken breast' })

    response.assertStatus(200)
    const names = response.body().data.map((item: { name: string }) => item.name)
    assert.deepEqual(names, ['Milk', 'Bread', 'Chicken breast'])
  })
})
