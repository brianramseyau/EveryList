import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { CategoryDto, ItemDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Test List' })
  return bodyData<ListDto>(response).id
}

/**
 * Creates the 8 "starter" categories directly on a given list, in the same
 * name/order the old global-default seeder used to provide, for tests that
 * rely on auto-categorization or on a specific category being present.
 */
async function seedStarterCategories(client: ApiClient, token: string, listId: number) {
  const names: Array<[string, string]> = [
    ['Produce', 'fruitCherries'],
    ['Dairy', 'cheese'],
    ['Meat', 'foodDrumstick'],
    ['Bakery', 'breadSlice'],
    ['Frozen', 'snowflake'],
    ['Pantry', 'foodCanArrowUp'],
    ['Household', 'spray'],
    ['Other', 'dotsHorizontalCircle'],
  ]
  const categories: CategoryDto[] = []
  for (const [name, icon] of names) {
    const response = await client
      .post(`/api/v1/lists/${listId}/categories`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name, icon })
    categories.push(bodyData<CategoryDto>(response))
  }
  return categories
}

test.group('Items CRUD', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates an item with auto-categorization, updates, checks, and soft-deletes it', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
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

  test('purge hard-deletes a soft-deleted item, removing it from recent and blocking restore', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Typo Itme' })
    )
    const item = create.body().data

    // Purging an active (not yet soft-deleted) item isn't allowed — it has to go through
    // `destroy` first, same as `restore` requires a soft-deleted row.
    const purgeActive = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}/purge`))
    purgeActive.assertStatus(404)

    const destroy = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}`))
    destroy.assertStatus(204)

    const purge = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}/purge`))
    purge.assertStatus(204)

    const recent = await auth(client.get(`/api/v1/lists/${listId}/items/recent`))
    assert.lengthOf(recent.body().data, 0)

    // The row is really gone, not just re-hidden — restoring it now 404s, and purging it again 404s.
    const restore = await auth(client.post(`/api/v1/lists/${listId}/items/${item.id}/restore`))
    restore.assertStatus(404)

    const purgeAgain = await auth(client.delete(`/api/v1/lists/${listId}/items/${item.id}/purge`))
    purgeAgain.assertStatus(404)
  })

  test('bulk import splits pasted text into items', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)

    const response = await client
      .post(`/api/v1/lists/${listId}/items/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ text: 'Milk\nBread\n\nChicken breast' })

    response.assertStatus(200)
    const names = response.body().data.map((item: { name: string }) => item.name)
    assert.deepEqual(names, ['Milk', 'Bread', 'Chicken breast'])
  })

  test('bulk import trims whitespace from plain item names', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const response = await client
      .post(`/api/v1/lists/${listId}/items/import`)
      .header('Authorization', `Bearer ${token}`)
      .json({ text: '  Milk \nBread   \n\n\t Eggs ' })

    response.assertStatus(200)
    const names = response.body().data.map((item: { name: string }) => item.name)
    assert.deepEqual(names, ['Milk', 'Bread', 'Eggs'])
  })

  test('bulk import parses an AnyList export, reusing matching categories and creating the rest', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const text = `Shopping List

CHEMIST
• Amber Meds
Prescription

PRODUCE
• Blueberries
• Apples

PRODUCE
• Bananas

COOKING
• Ground Coriander
• Cumin Seed

SNACKS
• Arnott's Country Cheese Crackers

TOILETRIES
• Toothpaste`

    const response = await auth(client.post(`/api/v1/lists/${listId}/items/import`).json({ text }))
    response.assertStatus(200)
    const items = response.body().data as ItemDto[]
    assert.deepEqual(
      items.map((item) => item.name),
      [
        'Amber Meds',
        'Blueberries',
        'Apples',
        'Bananas',
        'Ground Coriander',
        'Cumin Seed',
        "Arnott's Country Cheese Crackers",
        'Toothpaste',
      ]
    )

    const categories = bodyData<CategoryDto[]>(
      await auth(client.get(`/api/v1/lists/${listId}/categories`))
    )
    const byName = new Map(categories.map((category) => [category.name, category]))

    const chemist = byName.get('Chemist')
    const produce = byName.get('Produce')
    const cooking = byName.get('Cooking')
    const snacks = byName.get('Snacks')
    const toiletries = byName.get('Toiletries')
    assert.isDefined(chemist, 'missing AnyList category was created, title-cased')
    assert.isDefined(cooking, 'missing AnyList category was created, title-cased')
    assert.isDefined(snacks, 'missing AnyList category was created, title-cased')
    assert.isDefined(toiletries, 'missing AnyList category was created, title-cased')
    assert.isDefined(produce, 'existing starter category survived')

    assert.equal(items[0]!.notes, 'Prescription', 'bare line under an item becomes its note')
    assert.equal(items[0]!.categoryId, chemist!.id)
    assert.equal(items[1]!.categoryId, produce!.id, 'existing Produce was reused')
    assert.equal(
      items[3]!.categoryId,
      produce!.id,
      'second PRODUCE header reused the cached category'
    )
    assert.equal(items[4]!.categoryId, cooking!.id)
    assert.equal(items[6]!.categoryId, snacks!.id)
    assert.equal(items[7]!.categoryId, toiletries!.id)

    // 8 starters + the 4 new AnyList headers (Chemist, Cooking, Snacks,
    // Toiletries) — the duplicate PRODUCE header and the reused Produce must
    // not duplicate.
    assert.equal(categories.length, 12)
  })

  test('bulk import auto-categorizes bulleted items that precede the first header', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const response = await auth(
      client
        .post(`/api/v1/lists/${listId}/items/import`)
        .json({ text: '• Milk\n\nPRODUCE\n• Blueberries' })
    )
    response.assertStatus(200)
    const items = response.body().data as ItemDto[]

    const categories = bodyData<CategoryDto[]>(
      await auth(client.get(`/api/v1/lists/${listId}/categories`))
    )
    const dairy = categories.find((category) => category.name === 'Dairy')!

    assert.equal(items[0]!.name, 'Milk')
    assert.isNotNull(items[0]!.categoryId, 'uncategorized-section item still auto-categorizes')
    assert.equal(items[0]!.categoryId, dairy.id)
    assert.equal(
      items[1]!.categoryId,
      categories.find((category) => category.name === 'Produce')!.id
    )
    assert.equal(categories.length, 8, 'no extra categories created')
  })

  test('accepts an explicit categoryId, leaves unmatched names uncategorized, filters checked items, and unchecks', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
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

  test('tags an item with a store on create and via update, and clears it back to null', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const store = await auth(
      client.post(`/api/v1/lists/${listId}/stores`).json({ name: 'Corner Shop' })
    )
    const storeId = store.body().data.id

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk', storeId })
    )
    create.assertStatus(200)
    assert.equal(create.body().data.storeId, storeId)

    const itemId = create.body().data.id
    const clear = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${itemId}`).json({ storeId: null })
    )
    clear.assertStatus(200)
    assert.isNull(clear.body().data.storeId)

    const retag = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${itemId}`).json({ storeId })
    )
    retag.assertStatus(200)
    assert.equal(retag.body().data.storeId, storeId)
  })

  test('sets an item price in cents on create and via update, and clears it back to null', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk', price: 399 })
    )
    create.assertStatus(200)
    assert.equal(create.body().data.price, 399)

    const itemId = create.body().data.id
    const update = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${itemId}`).json({ price: 425 })
    )
    update.assertStatus(200)
    assert.equal(update.body().data.price, 425)

    const clear = await auth(
      client.patch(`/api/v1/lists/${listId}/items/${itemId}`).json({ price: null })
    )
    clear.assertStatus(200)
    assert.isNull(clear.body().data.price)
  })

  test('rejects a negative item price', async ({ client }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const create = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk', price: -50 })
    )
    create.assertStatus(422)
  })

  test('leaves an item uncategorized when its suggested category no longer exists', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
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

    await client
      .delete(`/api/v1/lists/${listId}/items/${itemId}`)
      .header('Authorization', `Bearer ${owner.token}`)

    const purge = await client
      .delete(`/api/v1/lists/${listId}/items/${itemId}/purge`)
      .header('Authorization', `Bearer ${viewer.token}`)
    purge.assertStatus(403)
  })

  test('an editor can create, update, delete, and purge items', async ({ client, assert }) => {
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

    const purge = await client
      .delete(`/api/v1/lists/${listId}/items/${create.body().data.id}/purge`)
      .header('Authorization', `Bearer ${editor.token}`)
    purge.assertStatus(204)
  })
})

test.group('Category suggestion (personalized + keyword fallback)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('GET categorize falls back to the static keyword table with no history', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const suggestion = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'Banana' })
    )
    suggestion.assertStatus(200)
    assert.isNotNull(suggestion.body().categoryId)

    const unknown = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'Xyzzy Widget' })
    )
    suggestion.assertStatus(200)
    assert.isNull(unknown.body().categoryId)
  })

  test('personalized history for this exact item name wins over the static keyword table', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const categories = await auth(client.get(`/api/v1/lists/${listId}/categories`))
    const household = categories
      .body()
      .data.find((category: { name: string }) => category.name === 'Household')

    // "Banana" would normally auto-categorize under Produce (static table) —
    // teach this list that its own "Banana" means something else 3 times so
    // the frequency-based personalization has a clear majority.
    for (let i = 0; i < 3; i++) {
      await auth(
        client
          .post(`/api/v1/lists/${listId}/items`)
          .json({ name: 'Banana', categoryId: household.id })
      )
    }

    const suggestion = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'banana' })
    )
    suggestion.assertStatus(200)
    assert.equal(suggestion.body().categoryId, household.id)

    // Item creation itself picks up the personalization too, not just the endpoint.
    const created = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Banana' })
    )
    assert.equal(created.body().data.categoryId, household.id)
  })

  test('categorize returns null for a blank/whitespace name without querying history', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)

    const response = await client
      .get(`/api/v1/lists/${listId}/items/categorize`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ name: '   ' })
    response.assertStatus(200)
    assert.isNull(response.body().categoryId)
  })

  test('categorize is viewer-accessible but requires list membership', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')
    const viewerResponse = await client
      .get(`/api/v1/lists/${listId}/items/categorize`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .qs({ name: 'Milk' })
    viewerResponse.assertStatus(200)

    const stranger = await signupAndGetUser(client)
    const strangerResponse = await client
      .get(`/api/v1/lists/${listId}/items/categorize`)
      .header('Authorization', `Bearer ${stranger.token}`)
      .qs({ name: 'Milk' })
    strangerResponse.assertStatus(404)
  })

  test('adding a name that matches an unchecked item returns the existing item instead of creating a duplicate', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const first = await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk' }))
    const firstItem = first.body().data

    const duplicate = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: '  MILK  ' })
    )
    duplicate.assertStatus(200)
    const duplicateItem = duplicate.body().data
    assert.equal(duplicateItem.id, firstItem.id)
    assert.isFalse(duplicateItem.checked)

    const index = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.lengthOf(index.body().data, 1, 'no duplicate row was created')
  })

  test('adding a name that matches a checked item unchecks it instead of creating a duplicate', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const first = await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk' }))
    const firstItem = first.body().data
    await auth(
      client
        .patch(`/api/v1/lists/${listId}/items/${firstItem.id}`)
        .json({ checked: true, expectedVersion: firstItem.version })
    )

    const readded = await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'milk' }))
    readded.assertStatus(200)
    const readdedItem = readded.body().data
    assert.equal(readdedItem.id, firstItem.id)
    assert.isFalse(readdedItem.checked)
    assert.isNull(readdedItem.checkedAt)
    assert.equal(
      readdedItem.version,
      firstItem.version + 2,
      'checked bumped it, uncheck bumps again'
    )

    const index = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.lengthOf(index.body().data, 1, 'no duplicate row was created')
  })

  test('recent-names returns distinct, most-recent-first item names including checked and deleted history', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const bananas = await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Bananas' })
    )
    await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Bread' }))
    await auth(client.delete(`/api/v1/lists/${listId}/items/${bananas.body().data.id}`))
    // Bulk import bypasses store()'s active/deleted dedup (which would otherwise restore the
    // just-deleted "Bananas" row instead of creating a second one) — the one remaining path that
    // produces a genuine same-name duplicate, exercising recentNames' own case-insensitive
    // collapse. Deleted items aren't excluded from the source query, only the duplicate name is.
    await auth(client.post(`/api/v1/lists/${listId}/items/import`).json({ text: 'bananas' }))

    const recentNames = await auth(client.get(`/api/v1/lists/${listId}/items/recent-names`))
    recentNames.assertStatus(200)
    const names: string[] = recentNames.body().data
    assert.deepEqual(names, ['bananas', 'Bread'])
  })

  test("re-adding a deleted item's name restores its old row, keeping store/price/quantity/notes instead of creating a fresh duplicate", async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const created = await auth(
      client
        .post(`/api/v1/lists/${listId}/items`)
        .json({ name: 'Milk', quantity: '2', notes: 'oat', price: 350 })
    )
    const original = created.body().data
    await auth(client.delete(`/api/v1/lists/${listId}/items/${original.id}`))

    const readded = await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'milk' }))
    readded.assertStatus(200)
    const restored = readded.body().data

    assert.equal(restored.id, original.id, 'same row restored, not a new one')
    assert.isNull(restored.deletedAt)
    assert.equal(restored.quantity, '2')
    assert.equal(restored.notes, 'oat')
    assert.equal(restored.price, 350)
    assert.equal(
      restored.version,
      original.version + 2,
      'delete bumped it, implicit restore bumps again'
    )

    const index = await auth(client.get(`/api/v1/lists/${listId}/items`))
    assert.lengthOf(index.body().data, 1, 'no duplicate row was created')
  })

  test('recent-names caps out at 50 distinct names', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    const names = Array.from({ length: 55 }, (_, i) => `Item ${i}`)
    await auth(client.post(`/api/v1/lists/${listId}/items/import`).json({ text: names.join('\n') }))

    const recentNames = await auth(client.get(`/api/v1/lists/${listId}/items/recent-names`))
    assert.lengthOf(recentNames.body().data, 50)
  })

  test('recent-names is viewer-accessible but requires list membership', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')
    const viewerResponse = await client
      .get(`/api/v1/lists/${listId}/items/recent-names`)
      .header('Authorization', `Bearer ${viewer.token}`)
    viewerResponse.assertStatus(200)

    const stranger = await signupAndGetUser(client)
    const strangerResponse = await client
      .get(`/api/v1/lists/${listId}/items/recent-names`)
      .header('Authorization', `Bearer ${stranger.token}`)
    strangerResponse.assertStatus(404)
  })
})
