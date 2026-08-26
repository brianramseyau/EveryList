import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiRequest } from '@japa/api-client'
import type { CategoryDto, CategoryLearningDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string, name = 'Test List') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

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

async function learnings(
  client: ApiClient,
  token: string,
  listId: number
): Promise<CategoryLearningDto[]> {
  return bodyData<CategoryLearningDto[]>(
    await client
      .get(`/api/v1/lists/${listId}/category-learnings`)
      .header('Authorization', `Bearer ${token}`)
  )
}

test.group('Category learnings (learned auto-categorization)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('learns only from an explicit categoryId, exposing the row via the endpoint', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const produce = categories.find((category) => category.name === 'Produce')!

    // Auto-categorized (no explicit categoryId) → must NOT teach the model.
    await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Bananas' }))
    assert.deepEqual(await learnings(client, token, listId), [])

    // Explicit categoryId → teaches, and re-assigning the same name again increments count.
    await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Apple', categoryId: produce.id })
    )
    await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'apples', categoryId: produce.id })
    )

    const rows = await learnings(client, token, listId)
    assert.deepEqual(rows, [
      {
        categoryId: produce.id,
        token: 'apple',
        count: 2,
        lastSeenAt: rows[0]!.lastSeenAt,
      },
    ])
    assert.match(rows[0]!.lastSeenAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  test('a learned association wins over the static keyword table', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const household = categories.find((category) => category.name === 'Household')!

    // "Banana" would static-suggest Produce, but the user explicitly chose Household.
    await auth(
      client
        .post(`/api/v1/lists/${listId}/items`)
        .json({ name: 'Banana', categoryId: household.id })
    )

    const suggestion = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'banana' })
    )
    assert.equal(suggestion.body().categoryId, household.id)
  })

  test('falls back to the static table and returns null with no match', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const dairy = categories.find((category) => category.name === 'Dairy')!

    const milk = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'Milk' })
    )
    assert.equal(milk.body().categoryId, dairy.id)

    const unknown = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'Xyzzy Widget' })
    )
    assert.isNull(unknown.body().categoryId)
  })

  test('a soft-deleted category is never suggested and drops out of the endpoint', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const produce = categories.find((category) => category.name === 'Produce')!

    await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Apples', categoryId: produce.id })
    )
    assert.lengthOf(await learnings(client, token, listId), 1)

    await auth(client.delete(`/api/v1/lists/${listId}/categories/${produce.id}`))

    assert.deepEqual(await learnings(client, token, listId), [])

    // The stale produce id must not be resurrected from the learned model.
    const suggestion = await auth(
      client.get(`/api/v1/lists/${listId}/items/categorize`).qs({ name: 'Apples' })
    )
    assert.isNull(suggestion.body().categoryId)
  })

  test('re-assigning an item to a different category via update teaches the model', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const produce = categories.find((category) => category.name === 'Produce')!
    const household = categories.find((category) => category.name === 'Household')!

    const item = bodyData<{ id: number }>(
      await auth(client.post(`/api/v1/lists/${listId}/items`).json({ name: 'Milk' }))
    )
    assert.deepEqual(await learnings(client, token, listId), [])

    // Dropdown/drag re-assignment to a different non-null category teaches it.
    await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ categoryId: household.id })
    )
    let rows = await learnings(client, token, listId)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0]!.token, 'milk')
    assert.equal(rows[0]!.categoryId, household.id)
    assert.equal(rows[0]!.count, 1)

    // Re-assigning to the same category is not a new assignment.
    await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ categoryId: household.id })
    )
    rows = await learnings(client, token, listId)
    assert.equal(rows[0]!.count, 1)

    // Changing to another category teaches the new one too (both rows exist).
    await auth(
      client.patch(`/api/v1/lists/${listId}/items/${item.id}`).json({ categoryId: produce.id })
    )
    rows = await learnings(client, token, listId)
    assert.lengthOf(rows, 2)
  })

  test('bulk import learns section-header categories but not header-less auto-categorized items', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)

    await auth(
      client
        .post(`/api/v1/lists/${listId}/items/import`)
        .json({ text: 'PRODUCE\n• Apples\n• Bananas' })
    )
    let rows = await learnings(client, token, listId)
    const produce = bodyData<CategoryDto[]>(
      await auth(client.get(`/api/v1/lists/${listId}/categories`))
    ).find((category) => category.name === 'Produce')!

    assert.lengthOf(rows, 2)
    assert.deepEqual(rows.map((row) => row.token).sort(), ['apple', 'banana'])
    assert.isTrue(rows.every((row) => row.categoryId === produce.id))

    // A plain (header-less) import auto-categorizes but must not teach.
    await auth(client.post(`/api/v1/lists/${listId}/items/import`).json({ text: 'Milk\nBread' }))
    rows = await learnings(client, token, listId)
    assert.lengthOf(rows, 2)
  })

  test('adding a favorite with a default category to a list teaches it', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const produce = categories.find((category) => category.name === 'Produce')!

    const favorite = bodyData<{ id: number }>(
      await auth(
        client
          .post(`/api/v1/lists/${listId}/favorites`)
          .json({ name: 'Apples', defaultCategoryId: produce.id })
      )
    )

    await auth(client.post(`/api/v1/lists/${listId}/favorites/${favorite.id}/add-to-list`))

    const rows = await learnings(client, token, listId)
    assert.deepEqual(
      rows.map((row) => ({ token: row.token, categoryId: row.categoryId, count: row.count })),
      [{ token: 'apple', categoryId: produce.id, count: 1 }]
    )
  })

  test('a name that tokenizes to nothing is not taught even with an explicit category', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const listId = await createList(client, token)
    const categories = await seedStarterCategories(client, token, listId)
    const auth = (req: ApiRequest) => req.header('Authorization', `Bearer ${token}`)
    const produce = categories.find((category) => category.name === 'Produce')!

    await auth(
      client.post(`/api/v1/lists/${listId}/items`).json({ name: '123', categoryId: produce.id })
    )

    assert.deepEqual(await learnings(client, token, listId), [])
  })

  test('category-learnings is viewer-accessible but requires list membership', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const auth = (token: string) => (req: ApiRequest) =>
      req.header('Authorization', `Bearer ${token}`)

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')
    const viewerResponse = await auth(viewer.token)(
      client.get(`/api/v1/lists/${listId}/category-learnings`)
    )
    viewerResponse.assertStatus(200)

    const stranger = await signupAndGetUser(client)
    const strangerResponse = await auth(stranger.token)(
      client.get(`/api/v1/lists/${listId}/category-learnings`)
    )
    strangerResponse.assertStatus(404)
  })
})
