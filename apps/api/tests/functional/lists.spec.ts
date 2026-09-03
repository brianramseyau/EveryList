import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import type { CategoryDto, ItemDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetToken, signupAndGetUser } from './helpers.js'

async function mintPat(
  client: ApiClient,
  token: string,
  listIds: number[],
  role: 'editor' | 'viewer' = 'editor'
): Promise<string> {
  const response = await client
    .post('/api/v1/tokens')
    .header('Authorization', `Bearer ${token}`)
    .json({ name: 'Widget', listIds, role })
  return bodyData<{ token: string }>(response).token
}

test.group('Lists CRUD', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/lists')
    response.assertStatus(401)
  })

  test('signup seeds a starter Todos list and a starter Shopping List owned by the new user', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const index = await client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)
    index.assertStatus(200)
    const indexed = bodyData<ListDto[]>(index)
    assert.lengthOf(indexed, 2)

    // Todos is created first so it sorts above Shopping List for a brand-new user.
    const [todos, shopping] = indexed
    assert.equal(todos?.name, 'Todos')
    assert.equal(todos?.icon, 'formatListChecks')
    assert.equal(todos?.color, '#1d4ed8')
    assert.isFalse(todos?.useCategories)
    assert.isFalse(todos?.useShops)
    assert.isFalse(todos?.useFavorites)
    assert.isFalse(todos?.useRecent)
    assert.isFalse(todos?.useQuantity)
    assert.isFalse(todos?.usePrice)
    assert.equal(todos?.itemCount, 5)

    assert.equal(shopping?.name, 'Shopping List')
    assert.equal(shopping?.icon, 'basket')
    assert.equal(shopping?.color, '#c2410c')
    assert.equal(shopping?.itemCount, 0)
    assert.isTrue(shopping?.useCategories)
    assert.isTrue(shopping?.useShops)
    assert.isTrue(shopping?.useFavorites)
    assert.isTrue(shopping?.useRecent)
    assert.isTrue(shopping?.useQuantity)
    assert.isTrue(shopping?.usePrice)
  })

  test('creates, lists, updates, and soft-deletes a list', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)
    const authed = () => client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip' })
    create.assertStatus(200)
    const createdList = bodyData<ListDto>(create)
    const listId = createdList.id
    assert.equal(createdList.name, 'Camping Trip')
    assert.equal(createdList.color, '#3b82f6')
    assert.equal(createdList.itemCount, 0)
    assert.isTrue(createdList.useCategories)

    const index = await authed()
    index.assertStatus(200)
    const indexed = bodyData<ListDto[]>(index)
    // Signup seeds a starter "Todos" list and a starter "Shopping List" list,
    // so the index has those two plus the one created above.
    assert.lengthOf(indexed, 3)
    const indexedCreated = indexed.find((list) => list.id === listId)
    assert.equal(indexedCreated?.itemCount, 0)

    const item = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Bananas' })
    const itemId = bodyData<ItemDto>(item).id

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    show.assertStatus(200)
    const shown = bodyData<ListDto>(show)
    assert.equal(shown.id, listId)
    assert.equal(shown.itemCount, 1, 'itemCount reflects unchecked, undeleted items')

    await client
      .patch(`/api/v1/lists/${listId}/items/${itemId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ checked: true })

    const showAfterCheck = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    assert.equal(bodyData<ListDto>(showAfterCheck).itemCount, 0, 'itemCount excludes checked items')

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Weekly Groceries', archived: true })
    update.assertStatus(200)
    const updatedList = bodyData<ListDto>(update)
    assert.equal(updatedList.name, 'Weekly Groceries')
    assert.isTrue(updatedList.archived)
    assert.isFalse(updatedList.badgeExcluded)

    const excludeFromBadge = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ badgeExcluded: true })
    excludeFromBadge.assertStatus(200)
    assert.isTrue(bodyData<ListDto>(excludeFromBadge).badgeExcluded)

    const disableCategories = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ useCategories: false })
    disableCategories.assertStatus(200)
    assert.isFalse(bodyData<ListDto>(disableCategories).useCategories)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    destroy.assertStatus(204)

    const showDeleted = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
    showDeleted.assertStatus(404)

    const updateDeleted = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Should not apply' })
    updateDeleted.assertStatus(404)
  })

  test('a list can opt out of categories at creation time', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Errands', useCategories: false })
    create.assertStatus(200)
    assert.isFalse(bodyData<ListDto>(create).useCategories)
  })

  test('update/destroy honor expectedVersion — omitted always applies, matching applies and bumps, stale conflicts with 409', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip' })
    const list = bodyData<ListDto & { version: number }>(create)
    assert.equal(list.version, 1)

    const unversioned = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Weekly Groceries' })
    unversioned.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(unversioned).version, 2)

    const stale = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Stale Name', expectedVersion: 1 })
    stale.assertStatus(409)
    assert.isTrue(stale.body().conflict)
    assert.equal(stale.body().data.version, 2)

    const matching = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Monthly Groceries', expectedVersion: 2 })
    matching.assertStatus(200)
    assert.equal(bodyData<{ version: number }>(matching).version, 3)

    const staleDestroy = await client
      .delete(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 2 })
    staleDestroy.assertStatus(409)

    const destroy = await client
      .delete(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .qs({ expectedVersion: 3 })
    destroy.assertStatus(204)
  })

  test("a user cannot see or update another user's list", async ({ client }) => {
    const ownerToken = await signupAndGetToken(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${ownerToken}`)
      .json({ name: 'Private list' })
    const listId = bodyData<ListDto>(create).id

    const otherToken = await signupAndGetToken(client)
    const response = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${otherToken}`)
    response.assertStatus(404)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${otherToken}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(404)
  })

  test('a viewer can see a list but cannot update or delete it', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    show.assertStatus(200)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${viewer.token}`)
    destroy.assertStatus(403)
  })

  test('an editor can see a list but cannot update or delete it (owner-only)', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    show.assertStatus(200)

    const update = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ name: 'Hijacked' })
    update.assertStatus(403)

    const destroy = await client
      .delete(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    destroy.assertStatus(403)
  })

  test('passcodeHash round-trips through update and is null by default; only an owner can set it', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const initialShow = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
    assert.isNull(bodyData<ListDto>(initialShow).passcodeHash)

    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const editorAttempt = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
      .json({ passcodeHash: 'salt:hash' })
    editorAttempt.assertStatus(403)

    const setPasscode = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ passcodeHash: 'abc123:def456' })
    setPasscode.assertStatus(200)
    assert.equal(bodyData<ListDto>(setPasscode).passcodeHash, 'abc123:def456')

    const show = await client
      .get(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${editor.token}`)
    assert.equal(bodyData<ListDto>(show).passcodeHash, 'abc123:def456')

    const clearPasscode = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ passcodeHash: null })
    clearPasscode.assertStatus(200)
    assert.isNull(bodyData<ListDto>(clearPasscode).passcodeHash)
  })

  test('a shared list appears in the index for every member', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Shared list' })
    const listId = bodyData<ListDto>(create).id

    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const index = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${viewer.token}`)
    const ids = bodyData<ListDto[]>(index).map((list) => list.id)
    assert.include(ids, listId)
  })

  test('list names are unique per owner, case-insensitively and trimmed, but not across owners', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    // Signup already seeded a "Shopping List" list for this owner — creating
    // another with different casing/whitespace should collide with it.
    const duplicate = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: '  shopping list  ' })
    duplicate.assertStatus(422)
    assert.equal(
      (duplicate.body() as unknown as { errors: { message: string }[] }).errors[0]?.message,
      'You already have a list with this name.'
    )

    const first = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip' })
    first.assertStatus(200)

    // A different owner using the exact same name must not collide —
    // the constraint is scoped per-owner, not global.
    const otherToken = await signupAndGetToken(client)
    const second = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${otherToken}`)
      .json({ name: 'Camping Trip' })
    second.assertStatus(200)
  })

  test("renaming a list to match another of the same owner's list names is rejected", async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip' })
    const listId = bodyData<ListDto>(create).id

    const rename = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'SHOPPING LIST' })
    rename.assertStatus(422)
    assert.equal(rename.body().errors[0].message, 'You already have a list with this name.')

    // Renaming a list to its own current name (no-op rename) must not
    // collide with itself.
    const noopRename = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip', archived: true })
    noopRename.assertStatus(200)
  })

  test('reordering lists persists a per-user sort order and skips ids the user has no membership on', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)
    const authed = () => client.get('/api/v1/lists').header('Authorization', `Bearer ${token}`)

    const index = await authed()
    const ids = bodyData<ListDto[]>(index).map((list) => list.id)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Camping Trip' })
    ids.push(bodyData<ListDto>(create).id)

    const reversed = [...ids].reverse()

    const otherToken = await signupAndGetToken(client)
    const otherCreate = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${otherToken}`)
      .json({ name: "Someone else's list" })
    const otherListId = bodyData<ListDto>(otherCreate).id
    const otherIndexBefore = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${otherToken}`)
    const otherIdsBefore = bodyData<ListDto[]>(otherIndexBefore).map((list) => list.id)

    const reorder = await client
      .patch('/api/v1/lists/reorder')
      .header('Authorization', `Bearer ${token}`)
      .json({ order: [otherListId, ...reversed] })
    reorder.assertStatus(200)

    const reorderedIds = bodyData<ListDto[]>(reorder).map((list) => list.id)
    assert.deepEqual(reorderedIds, reversed)

    const reload = await authed()
    assert.deepEqual(
      bodyData<ListDto[]>(reload).map((list) => list.id),
      reversed
    )

    // The foreign id in the reorder payload must be silently skipped — it
    // isn't `token`'s own membership row, so it can't touch `otherToken`'s order.
    const otherIndexAfter = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${otherToken}`)
    assert.deepEqual(
      bodyData<ListDto[]>(otherIndexAfter).map((list) => list.id),
      otherIdsBefore
    )
  })

  test('each member has their own independent order for a shared list', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const firstCreate = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'First' })
    const firstId = bodyData<ListDto>(firstCreate).id
    const secondCreate = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Second' })
    const secondId = bodyData<ListDto>(secondCreate).id

    const viewer = await signupAndGetUser(client)
    await addMember(firstId, viewer.id, 'viewer')
    await addMember(secondId, viewer.id, 'viewer')

    await client
      .patch('/api/v1/lists/reorder')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ order: [secondId, firstId] })

    const viewerIndex = await client
      .get('/api/v1/lists')
      .header('Authorization', `Bearer ${viewer.token}`)
    const viewerIds = bodyData<ListDto[]>(viewerIndex)
      .map((list) => list.id)
      .filter((id) => id === firstId || id === secondId)
    assert.deepEqual(viewerIds, [firstId, secondId])
  })
})

test.group('Widget snapshot', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/lists/1/widget-snapshot')
    response.assertStatus(401)
  })

  test("returns items pre-ordered by category then name, matching the app's grouped display, flattened", async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries', itemSortOrder: 'alphabetical' })
    const listId = bodyData<ListDto>(create).id

    const produce = bodyData<CategoryDto>(
      await client
        .post(`/api/v1/lists/${listId}/categories`)
        .header('Authorization', `Bearer ${owner.token}`)
        .json({ name: 'Produce', icon: 'fruitCherries' })
    )
    const dairy = bodyData<CategoryDto>(
      await client
        .post(`/api/v1/lists/${listId}/categories`)
        .header('Authorization', `Bearer ${owner.token}`)
        .json({ name: 'Dairy', icon: 'cheese' })
    )
    // Dairy sorts before Produce.
    await client
      .patch(`/api/v1/lists/${listId}/categories/reorder`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ order: [dairy.id, produce.id] })

    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Apples', categoryId: produce.id, quantity: '3' })
    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Milk', categoryId: dairy.id })
    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Batteries', categoryId: null })

    const pat = await mintPat(client, owner.token, [listId], 'viewer')
    const response = await client
      .get(`/api/v1/lists/${listId}/widget-snapshot`)
      .header('Authorization', `Bearer ${pat}`)
    response.assertStatus(200)

    const snapshot = bodyData<{
      listName: string
      items: {
        id: number
        name: string
        checked: boolean
        quantity: string | null
        price: number | null
      }[]
    }>(response)
    assert.equal(snapshot.listName, 'Groceries')
    // Dairy (reordered first) before Produce, uncategorized last — matches
    // buildFlatDisplayOrder/apl_view.ts's ordering, just without category headers.
    assert.deepEqual(
      snapshot.items.map((item) => item.name),
      ['Milk', 'Apples', 'Batteries']
    )
    assert.equal(snapshot.items[0]?.quantity, null)
    assert.equal(snapshot.items[1]?.quantity, '3')
  })

  test('includeChecked=false hides checked items', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const listId = bodyData<ListDto>(create).id

    const milk = bodyData<ItemDto>(
      await client
        .post(`/api/v1/lists/${listId}/items`)
        .header('Authorization', `Bearer ${owner.token}`)
        .json({ name: 'Milk' })
    )
    await client
      .patch(`/api/v1/lists/${listId}/items/${milk.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ checked: true })
    await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Eggs' })

    const withChecked = bodyData<{ items: { name: string }[] }>(
      await client
        .get(`/api/v1/lists/${listId}/widget-snapshot`)
        .header('Authorization', `Bearer ${owner.token}`)
    )
    assert.sameMembers(
      withChecked.items.map((item) => item.name),
      ['Milk', 'Eggs']
    )

    const withoutChecked = bodyData<{ items: { name: string }[] }>(
      await client
        .get(`/api/v1/lists/${listId}/widget-snapshot?includeChecked=false`)
        .header('Authorization', `Bearer ${owner.token}`)
    )
    assert.deepEqual(
      withoutChecked.items.map((item) => item.name),
      ['Eggs']
    )
  })

  test('a user with no access to the list is denied', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Groceries' })
    const listId = bodyData<ListDto>(create).id

    const outsider = await signupAndGetUser(client)
    const response = await client
      .get(`/api/v1/lists/${listId}/widget-snapshot`)
      .header('Authorization', `Bearer ${outsider.token}`)
    response.assertStatus(404)
  })
})

test.group('Open item limit settings', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('maxUncheckedItems round-trips through create and update, clearing back to no limit', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Today', maxUncheckedItems: 5 })
    create.assertStatus(200)
    const created = bodyData<ListDto>(create)
    assert.equal(created.maxUncheckedItems, 5)

    const lower = await client
      .patch(`/api/v1/lists/${created.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ maxUncheckedItems: 3 })
    lower.assertStatus(200)
    assert.equal(bodyData<ListDto>(lower).maxUncheckedItems, 3)

    const clear = await client
      .patch(`/api/v1/lists/${created.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ maxUncheckedItems: null })
    clear.assertStatus(200)
    assert.isNull(bodyData<ListDto>(clear).maxUncheckedItems)

    const show = await client
      .get(`/api/v1/lists/${created.id}`)
      .header('Authorization', `Bearer ${token}`)
    assert.isNull(bodyData<ListDto>(show).maxUncheckedItems)
  })

  test('maxUncheckedItems rejects out-of-range and non-whole values', async ({ client }) => {
    const token = await signupAndGetToken(client)

    for (const bad of [0, -1, 1000, 2.5, 'two']) {
      const create = await client
        .post('/api/v1/lists')
        .header('Authorization', `Bearer ${token}`)
        .json({ name: `Bad ${bad}`, maxUncheckedItems: bad })
      create.assertStatus(422)
    }

    // Validation runs inside the controller, after the policy's 404 gate —
    // so the 422 is asserted against a list the user actually owns.
    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Real list' })
    const listId = bodyData<ListDto>(create).id

    const patch = await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ maxUncheckedItems: 0 })
    patch.assertStatus(422)
  })
})
test.group('List deadline flag (PLAN_24_PHASE_ITEM_DEADLINES.md)', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('useDeadline defaults to false and persists enable/disable updates', async ({
    client,
    assert,
  }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Deadlines off by default' })
    create.assertStatus(200)
    const list = bodyData<ListDto>(create)
    assert.isFalse(list.useDeadline, 'the one default-off feature flag')

    const enable = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ useDeadline: true })
    enable.assertStatus(200)
    assert.isTrue(bodyData<ListDto>(enable).useDeadline)

    const fetched = await client
      .get(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
    fetched.assertStatus(200)
    assert.isTrue(bodyData<ListDto>(fetched).useDeadline)

    const disable = await client
      .patch(`/api/v1/lists/${list.id}`)
      .header('Authorization', `Bearer ${token}`)
      .json({ useDeadline: false })
    disable.assertStatus(200)
    assert.isFalse(bodyData<ListDto>(disable).useDeadline)
  })

  test('accepts itemSortOrder deadline alongside enabling the flag', async ({ client, assert }) => {
    const token = await signupAndGetToken(client)

    const create = await client
      .post('/api/v1/lists')
      .header('Authorization', `Bearer ${token}`)
      .json({ name: 'Deadline sorted', useDeadline: true, itemSortOrder: 'deadline' })
    create.assertStatus(200)
    const list = bodyData<ListDto>(create)
    assert.isTrue(list.useDeadline)
    assert.equal(list.itemSortOrder, 'deadline')
  })
})
