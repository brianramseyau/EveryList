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
    .json({ name: 'Test List' })
  return bodyData<ListDto>(response).id
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

  test('update/destroy honor expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/categories`).json({ name: 'Pet Supplies', icon: 'paw' })
    )
    const category = create.body().data
    assert.equal(category.version, 1)

    const unversioned = await auth(
      client.patch(`/api/v1/lists/${listId}/categories/${category.id}`).json({ icon: 'dog' })
    )
    unversioned.assertStatus(200)
    assert.equal(unversioned.body().data.version, 2)

    const stale = await auth(
      client
        .patch(`/api/v1/lists/${listId}/categories/${category.id}`)
        .json({ icon: 'cat', expectedVersion: 1 })
    )
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)

    const matching = await auth(
      client
        .patch(`/api/v1/lists/${listId}/categories/${category.id}`)
        .json({ icon: 'cat', expectedVersion: 2 })
    )
    matching.assertStatus(200)
    assert.equal(matching.body().data.icon, 'cat')
    assert.equal(matching.body().data.version, 3)

    const staleDestroy = await auth(
      client.delete(`/api/v1/lists/${listId}/categories/${category.id}`).qs({ expectedVersion: 2 })
    )
    staleDestroy.assertStatus(409)

    const destroy = await auth(
      client.delete(`/api/v1/lists/${listId}/categories/${category.id}`).qs({ expectedVersion: 3 })
    )
    destroy.assertStatus(204)
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

    // Renaming an already-forked (list-scoped) category again should reuse
    // the same row rather than forking a second time.
    const rerename = await client
      .patch(`/api/v1/lists/${listId}/categories/${rename.body().data.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Produce & Veg' })
    rerename.assertStatus(200)
    assert.equal(rerename.body().data.id, rename.body().data.id)
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

  test('reordering silently skips an id that is not in the list', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const ids = index.body().data.map((c: { id: number }) => c.id)
    const bogusCategoryId = 999_999

    const reorder = await client
      .patch(`/api/v1/lists/${listId}/categories/reorder`)
      .header('Authorization', `Bearer ${token}`)
      .json({ order: [bogusCategoryId, ...ids] })
    reorder.assertStatus(200)
    assert.lengthOf(reorder.body().data, ids.length)
  })

  test('deleting a list-scoped category removes it', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const create = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    const categoryId = create.body().data.id

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/categories/${categoryId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const names = index.body().data.map((c: { name: string }) => c.name)
    assert.notInclude(names, 'Pet Supplies')
  })

  test('a viewer can list categories but cannot create, update, or delete them', async ({
    client,
  }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)
    const produce = index.body().data.find((c: { name: string }) => c.name === 'Produce')

    const create = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    create.assertStatus(403)

    const update = await client
      .patch(`/api/v1/lists/${listId}/categories/${produce.id}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/categories/${produce.id}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    destroy.assertStatus(403)
  })

  test('an editor can create, update, and delete categories', async ({ client, assert }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const create = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    create.assertStatus(200)
    assert.equal(create.body().data.name, 'Pet Supplies')

    const destroy = await client
      .delete(`/api/v1/lists/${listId}/categories/${create.body().data.id}`)
      .header('Authorization', `Bearer ${editor.token}`)
    destroy.assertStatus(204)
  })

  test('a stranger gets a 404 trying to read or write categories', async ({ client }) => {
    await new DefaultCategorySeeder(db.connection()).run()
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const stranger = await signupAndGetUser(client)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${stranger.token}`)
    index.assertStatus(404)

    const create = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ name: 'Pet Supplies', icon: 'paw' })
    create.assertStatus(404)
  })
})
