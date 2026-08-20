import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { CategoryDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string, name = 'Test List') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

/** Creates a real list-scoped category via the API, for tests that just need something to act on. */
async function createCategory(
  client: ApiClient,
  token: string,
  listId: number,
  name: string,
  icon = 'basket'
) {
  const response = await client
    .post(`/api/v1/lists/${listId}/categories`)
    .header('Authorization', `Bearer ${token}`)
    .json({ name, icon })
  return bodyData<CategoryDto>(response)
}

test.group('Categories', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('a freshly created list starts with zero categories', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    assert.lengthOf(index.body().data, 0)
  })

  test("a freshly signed-up user's first list is pre-populated with the 8 starter categories", async ({
    client,
    assert,
  }) => {
    const signup = await client.post('/api/v1/auth/signup').json({
      fullName: 'New User',
      email: 'starter-categories@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    signup.assertStatus(200)
    const token = bodyData<{ token: string }>(signup).token

    const lists = await client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)
    lists.assertStatus(200)
    const listIndex = bodyData<ListDto[]>(lists)
    assert.lengthOf(listIndex, 1)
    const listId = listIndex[0]!.id

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    const categories = bodyData<CategoryDto[]>(index)
    assert.lengthOf(categories, 8)
    assert.deepEqual(
      categories.map((c) => c.name),
      ['Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen', 'Pantry', 'Household', 'Other']
    )
  })

  test('creating a custom category adds it to the list', async ({ client, assert }) => {
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
    assert.lengthOf(index.body().data, 1)
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

  test('renaming a list-scoped category updates it in place', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const produce = await createCategory(client, token, listId, 'Produce', 'fruitCherries')

    const rename = await client
      .patch(`/api/v1/lists/${listId}/categories/${produce.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Fruit & Veg' })
    rename.assertStatus(200)
    assert.equal(rename.body().data.listId, listId)
    assert.equal(rename.body().data.id, produce.id)
    assert.equal(rename.body().data.name, 'Fruit & Veg')

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    const names = index.body().data.map((c: { name: string }) => c.name)
    assert.include(names, 'Fruit & Veg')
    assert.notInclude(names, 'Produce')
    assert.lengthOf(names, 1)
  })

  test('reordering categories persists the new sort order', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await createCategory(client, token, listId, 'Produce')
    await createCategory(client, token, listId, 'Dairy')
    await createCategory(client, token, listId, 'Meat')

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
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await createCategory(client, token, listId, 'Produce')
    await createCategory(client, token, listId, 'Dairy')

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
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const produce = await createCategory(client, owner.token, listId, 'Produce', 'fruitCherries')
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${viewer.token}`)
    index.assertStatus(200)

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

test.group('Categories import', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('imports every category from another list, appended to the target in order', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    const sourceId = await createList(client, token, 'Source List')
    await createCategory(client, token, sourceId, 'Produce', 'fruitCherries')
    await createCategory(client, token, sourceId, 'Dairy', 'cheese')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId })
    importResponse.assertStatus(200)
    const imported = bodyData<CategoryDto[]>(importResponse)
    assert.lengthOf(imported, 2)
    assert.deepEqual(
      imported.map((c) => c.name),
      ['Produce', 'Dairy']
    )
    assert.deepEqual(
      imported.map((c) => c.icon),
      ['fruitCherries', 'cheese']
    )
    for (const category of imported) {
      assert.equal(category.listId, targetId)
      assert.isFalse(category.isDefault)
      assert.equal(category.version, 1)
    }
    assert.deepEqual(
      imported.map((c) => c.sortOrder),
      [0, 1]
    )

    const index = await client
      .get(`/api/v1/lists/${targetId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    assert.deepEqual(
      index.body().data.map((c: CategoryDto) => c.name),
      ['Produce', 'Dairy']
    )
  })

  test('appends imported categories after the target list existing ones', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    await createCategory(client, token, targetId, 'Existing', 'tag')
    const sourceId = await createList(client, token, 'Source List')
    await createCategory(client, token, sourceId, 'Imported', 'paw')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId })
    const imported = bodyData<CategoryDto[]>(importResponse)
    assert.equal(imported[0]!.sortOrder, 1)

    const index = await client
      .get(`/api/v1/lists/${targetId}/categories`)
      .header('Authorization', `Bearer ${token}`)
    assert.deepEqual(
      index.body().data.map((c: CategoryDto) => c.name),
      ['Existing', 'Imported']
    )
  })

  test('imports only the requested category ids', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    const sourceId = await createList(client, token, 'Source List')
    await createCategory(client, token, sourceId, 'Produce')
    const dairy = await createCategory(client, token, sourceId, 'Dairy')
    await createCategory(client, token, sourceId, 'Meat')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId, categoryIds: [dairy.id] })
    importResponse.assertStatus(200)
    const imported = bodyData<CategoryDto[]>(importResponse)
    assert.deepEqual(
      imported.map((c) => c.name),
      ['Dairy']
    )
  })

  test('silently skips ids that are not on the source list', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    const sourceId = await createList(client, token, 'Source List')
    await createCategory(client, token, sourceId, 'Produce')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId, categoryIds: [999_999] })
    importResponse.assertStatus(200)
    assert.lengthOf(bodyData<CategoryDto[]>(importResponse), 0)
  })

  test('skips categories that already exist on the target, case-insensitively', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    await createCategory(client, token, targetId, 'Produce')
    const sourceId = await createList(client, token, 'Source List')
    await createCategory(client, token, sourceId, 'produce')
    await createCategory(client, token, sourceId, 'Dairy')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId })
    const imported = bodyData<CategoryDto[]>(importResponse)
    assert.deepEqual(
      imported.map((c) => c.name),
      ['Dairy']
    )
  })

  test('rejects importing from the list itself', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const importResponse = await client
      .post(`/api/v1/lists/${listId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: listId })
    importResponse.assertStatus(422)
  })

  test('an editor can import into a list they do not own, from a list they can only view', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const targetId = await createList(client, owner.token)
    const sourceId = await createList(client, owner.token, 'Source List')
    await createCategory(client, owner.token, sourceId, 'Produce', 'fruitCherries')

    const editor = await signupAndGetUser(client)
    await addMember(targetId, editor.id, 'editor')
    await addMember(sourceId, editor.id, 'viewer')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ sourceListId: sourceId })
    importResponse.assertStatus(200)
    const imported = bodyData<CategoryDto[]>(importResponse)
    assert.equal(imported[0]!.name, 'Produce')
    assert.equal(imported[0]!.icon, 'fruitCherries')
  })

  test('a viewer cannot import categories into a list', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const targetId = await createList(client, owner.token)
    const sourceId = await createList(client, owner.token, 'Source List')
    await createCategory(client, owner.token, sourceId, 'Produce')

    const viewer = await signupAndGetUser(client)
    await addMember(targetId, viewer.id, 'viewer')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ sourceListId: sourceId })
    importResponse.assertStatus(403)
  })

  test('a stranger gets a 404 importing from a list they cannot access', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const targetId = await createList(client, owner.token)
    const sourceId = await createList(client, owner.token, 'Source List')
    await createCategory(client, owner.token, sourceId, 'Produce')

    const stranger = await signupAndGetUser(client)
    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .json({ sourceListId: sourceId })
    importResponse.assertStatus(404)
  })

  test('importing from a source with no categories returns an empty list', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const targetId = await createList(client, token)
    const sourceId = await createList(client, token, 'Source List')

    const importResponse = await client
      .post(`/api/v1/lists/${targetId}/categories/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ sourceListId: sourceId })
    importResponse.assertStatus(200)
    assert.lengthOf(bodyData<CategoryDto[]>(importResponse), 0)
  })
})
