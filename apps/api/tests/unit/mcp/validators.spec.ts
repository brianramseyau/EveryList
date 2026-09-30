import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import Category from '#models/category'
import Store from '#models/store'
import ListStore from '#models/list_store'
import {
  addItemArgsValidator,
  assertScopedRefs,
  updateItemArgsValidator,
  validateToolArgs,
} from '#validators/mcp'
import { McpToolError } from '#services/mcp/access'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

async function makeList(owner: User, name = 'Groceries') {
  const list = await List.create({ name, ownerId: owner.id })
  await ListMember.create({
    listId: list.id,
    userId: owner.id,
    role: 'owner',
    invitedAt: DateTime.now(),
    acceptedAt: DateTime.now(),
  })
  return list
}

test.group('MCP arg validators', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('addItemArgsValidator requires list + name and rejects a bad id/price', async ({
    assert,
  }) => {
    const ok = await validateToolArgs(addItemArgsValidator, { list: 'Groceries', name: 'Milk' })
    assert.equal(ok.name, 'Milk')

    const error = await validateToolArgs(addItemArgsValidator, { list: '', name: 'Milk' }).catch(
      (e) => e
    )
    assert.instanceOf(error, McpToolError)
    assert.include(error.message, 'list')

    // A non-numeric price is rejected before it reaches the DB.
    await assert.rejects(
      () => validateToolArgs(addItemArgsValidator, { list: 'G', name: 'Milk', price: 'free' }),
      McpToolError
    )
  })

  test('updateItemArgsValidator accepts a partial update and rejects a bad itemId', async ({
    assert,
  }) => {
    const ok = await validateToolArgs(updateItemArgsValidator, {
      list: 'Groceries',
      itemId: 1,
      notes: null,
    })
    assert.equal(ok.notes, null)

    const error = await validateToolArgs(updateItemArgsValidator, {
      list: 'Groceries',
      itemId: -1,
    }).catch((e) => e)
    assert.instanceOf(error, McpToolError)
  })

  test('a non-VineJS error from a validator is rethrown untouched', async ({ assert }) => {
    await assert.rejects(
      () =>
        validateToolArgs(
          {
            validate: async () => {
              throw new Error('kaboom')
            },
          },
          {}
        ),
      /kaboom/
    )
  })

  test('assertScopedRefs accepts null/undefined and a valid category and store', async () => {
    const owner = await makeUser('mcp-val-1@example.com')
    const list = await makeList(owner)
    const category = await Category.create({
      listId: list.id,
      name: 'Dairy',
      icon: 'cheese',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })
    const store = await Store.create({ name: 'Woolworths', createdBy: owner.id, color: '#3b82f6' })
    await ListStore.create({ listId: list.id, storeId: store.id })

    // null (clear) and undefined (leave alone) never hit the DB.
    await assertScopedRefs(list, { categoryId: null, storeId: undefined })
    await assertScopedRefs(list, { categoryId: category.id, storeId: store.id })
  })

  test('assertScopedRefs refuses a category or store from another list', async ({ assert }) => {
    const owner = await makeUser('mcp-val-2@example.com')
    const list = await makeList(owner, 'Groceries')
    const otherList = await makeList(owner, 'Other')
    const foreignCategory = await Category.create({
      listId: otherList.id,
      name: 'Dairy',
      icon: 'cheese',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })
    const unattachedStore = await Store.create({
      name: 'Coles',
      createdBy: owner.id,
      color: '#3b82f6',
    })

    const badCategory = await assertScopedRefs(list, {
      categoryId: foreignCategory.id,
    }).catch((e) => e)
    assert.instanceOf(badCategory, McpToolError)
    assert.include(badCategory.message, 'Category not found')

    const badStore = await assertScopedRefs(list, { storeId: unattachedStore.id }).catch((e) => e)
    assert.instanceOf(badStore, McpToolError)
    assert.include(badStore.message, 'Store is not attached')
  })
})
