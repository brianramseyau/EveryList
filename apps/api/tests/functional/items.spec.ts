import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import DefaultCategorySeeder from '#database/seeders/default_category_seeder'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

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

  test('update/destroy honor expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk' }))
    const item = create.body().data
    assert.equal(item.version, 1)

    // Omitted expectedVersion: unchanged existing behavior, still applies.
    const unversioned = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ quantity: '1' })
    )
    unversioned.assertStatus(200)
    assert.equal(unversioned.body().data.version, 2)

    // Stale expectedVersion: rejected with 409 + the server's current copy, no mutation applied.
    const stale = await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}`)
        .json({ quantity: '99', expectedVersion: 1 })
    )
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)
    assert.equal(stale.body().data.quantity, '1')

    // Matching expectedVersion: applies and bumps.
    const matching = await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${item.id}`)
        .json({ quantity: '3', expectedVersion: 2 })
    )
    matching.assertStatus(200)
    assert.equal(matching.body().data.quantity, '3')
    assert.equal(matching.body().data.version, 3)

    // destroy: stale expectedVersion conflicts, matching applies (soft-delete).
    const staleDestroy = await auth(
      client.delete(`/api/v1/lists/${listId}/items/${item.id}`).qs({ expectedVersion: 2 })
    )
    staleDestroy.assertStatus(409)

    const destroy = await auth(
      client.delete(`/api/v1/lists/${listId}/items/${item.id}`).qs({ expectedVersion: 3 })
    )
    destroy.assertStatus(204)
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

  test('accepts an explicit categoryId, leaves unmatched names uncategorized, filters checked items, and unchecks', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const categories = await auth(client.get(`/api/v1/lists/${listId}/categories`))
    const categoryId = categories.body().data[0].id

    const explicit = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Something odd', categoryId })
    )
    explicit.assertStatus(200)
    assert.equal(explicit.body().data.categoryId, categoryId)

    const unmatched = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Xyzzy Nonsense' })
    )
    unmatched.assertStatus(200)
    assert.isNull(unmatched.body().data.categoryId)

    const check = await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${unmatched.body().data.id}`)
        .json({ checked: true })
    )
    check.assertStatus(200)

    const onlyUnchecked = await auth(
      client.get(`/api/v1/lists/${listId}/items`).qs({ includeChecked: 'false' })
    )
    onlyUnchecked.assertStatus(200)
    const uncheckedNames = onlyUnchecked.body().data.map((item: { name: string }) => item.name)
    assert.notInclude(uncheckedNames, 'Xyzzy Nonsense')

    const uncheck = await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${unmatched.body().data.id}`)
        .json({ checked: false })
    )
    uncheck.assertStatus(200)
    assert.isFalse(uncheck.body().data.checked)
    assert.isNull(uncheck.body().data.checkedAt)
  })

  test('leaves an item uncategorized when its suggested category no longer exists', async ({
    client,
    assert,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const categories = await auth(client.get(`/api/v1/lists/${listId}/categories`))
    const produce = categories.body().data.find((c: { name: string }) => c.name === 'Produce')

    // Renaming "Produce" removes that name from the list's effective
    // categories, so "Bananas" (which suggests "Produce") should no longer
    // resolve to a category.
    await auth(
      client.patch(`/api/v1/lists/${listId}/categories/${produce.id}`).json({ name: 'Fruit & Veg' })
    )

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Bananas' })
    )
    create.assertStatus(200)
    assert.isNull(create.body().data.categoryId)
  })

  test('a viewer can list items but cannot create, update, or delete them', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const create = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Bananas' })
    const itemId = create.body().data.id

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)

    const viewerCreate = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Bread' })
    viewerCreate.assertStatus(403)

    const update = await client
      .patch(`/api/v1/lists/${listId}/items/${itemId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ checked: true })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/items/${itemId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    destroy.assertStatus(403)
  })

  test('an editor can create, update, and delete items', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const create = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ name: 'Bananas' })
    create.assertStatus(200)
    assert.equal(create.body().data.name, 'Bananas')

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/items/${create.body().data.id}`)
      .header('Authorization', `Bearer ${editor.token}`)
    destroy.assertStatus(204)
  })
})
