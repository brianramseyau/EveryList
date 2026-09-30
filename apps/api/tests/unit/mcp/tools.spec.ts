import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import Item from '#models/item'
import Category from '#models/category'
import ItemRecurrence from '#models/item_recurrence'
import SubItem from '#models/sub_item'
import AddItemTool from '#mcp/tools/add_item_tool'
import AddSubtaskTool from '#mcp/tools/add_subtask_tool'
import CompleteItemTool from '#mcp/tools/complete_item_tool'
import CreateListTool from '#mcp/tools/create_list_tool'
import GetItemTool from '#mcp/tools/get_item_tool'
import GetListTool from '#mcp/tools/get_list_tool'
import ListListsTool from '#mcp/tools/list_lists_tool'
import RemoveItemTool from '#mcp/tools/remove_item_tool'
import SearchItemsTool from '#mcp/tools/search_items_tool'
import UncompleteItemTool from '#mcp/tools/uncomplete_item_tool'
import UpdateItemTool from '#mcp/tools/update_item_tool'

/**
 * Unit tests for the MCP tools themselves (foundational/PLAN_32_PHASE_MCP_SERVER.md), driving
 * each tool's `handle` directly. The functional suite covers the HTTP/JSON-RPC surface and the
 * happy paths; this suite's job is the guard branches that are awkward to reach through the
 * full protocol (missing auth, missing arguments) and a few tool-specific edge cases (the
 * get_item sub-task split, search_items' checked filter, add_item's restore/limit refusals).
 *
 * Tools are exercised with the same context shape the package hands `handle`: `{ args, response,
 * auth }`, where `response` is the package's real response factory and `auth` is a stand-in
 * carrying `user` (the HTTP transport binds the real HttpContext auth object).
 */

/**
 * A minimal stand-in for the package's McpResponse: tools only call `.text()`,
 * `.structured()`, and `.error()`. Kept as a tiny fake so the unit suite stays a unit suite.
 */
class FakeResponse {
  last: { kind: string; payload: unknown } | null = null
  text(text: string) {
    this.last = { kind: 'text', payload: text }
    return { kind: 'text' as const, text }
  }
  structured(object: Record<string, unknown>) {
    this.last = { kind: 'structured', payload: object }
    return { kind: 'structured' as const, structuredContent: object }
  }
  error(message: string) {
    this.last = { kind: 'error', payload: message }
    return { kind: 'error' as const, text: message }
  }
  structuredValue<T>(): T {
    return this.last?.payload as T
  }
  textValue(): string {
    return this.last?.payload as string
  }
  isError(): boolean {
    return this.last?.kind === 'error'
  }
}

type FakeAuth = { user: User | undefined }

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

/** The account plus a PAT scoped to `list`, with `currentAccessToken` set the way the guard does. */
async function patFor(user: User, list: List, role: 'editor' | 'viewer' = 'editor') {
  const token = await User.personalAccessTokens.create(user, [`list:${list.id}:${role}`], {
    name: 'unit',
  })
  user.currentAccessToken = token
  return token
}

async function makeList(owner: User, name: string, attributes: Record<string, unknown> = {}) {
  const list = await List.create({ name, ownerId: owner.id, ...attributes })
  await ListMember.create({
    listId: list.id,
    userId: owner.id,
    role: 'owner',
    invitedAt: DateTime.now(),
    acceptedAt: DateTime.now(),
  })
  return list
}

/** Runs a tool with the given args/auth and returns its fake response. */
async function run(
  tool: { name: string; handle: (ctx: never) => unknown },
  args: Record<string, unknown> | undefined,
  user: User | undefined
): Promise<FakeResponse> {
  const response = new FakeResponse()
  const ctx = { args, response, auth: { user } as FakeAuth } as unknown as never
  await tool.handle(ctx)
  return response
}

/** Cast helper for the heterogeneous `cases` arrays below. */
function asTool(tool: unknown): { name: string; handle: (ctx: never) => unknown } {
  return tool as { name: string; handle: (ctx: never) => unknown }
}

test.group('MCP tool guards', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('every tool refuses to run without an authenticated user', async ({ assert }) => {
    const tools = [
      new AddItemTool(),
      new AddSubtaskTool(),
      new CompleteItemTool(),
      new CreateListTool(),
      new GetItemTool(),
      new GetListTool(),
      new ListListsTool(),
      new RemoveItemTool(),
      new SearchItemsTool(),
      new UncompleteItemTool(),
      new UpdateItemTool(),
    ]
    for (const tool of tools) {
      const response = await run(tool, {}, undefined)
      assert.isTrue(response.isError(), `${tool.name} should refuse unauthenticated calls`)
      assert.equal(response.textValue(), 'Authentication required.')
    }
  })

  test('tools refuse a call missing a required argument', async ({ assert }) => {
    const user = await makeUser('mcp-guards-1@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)

    const cases: [
      InstanceType<typeof AddItemTool | typeof GetListTool>,
      Record<string, unknown>,
    ][] = [
      [new AddItemTool(), { name: 'Milk' }],
      [new AddItemTool(), { list: 'Groceries' }],
      [new GetListTool(), {}],
    ]
    for (const [tool, args] of cases) {
      const response = await run(tool, args, user)
      assert.isTrue(response.isError())
    }
  })

  test('add_item creates, then restores a soft-deleted row with its metadata', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-2@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)

    const created = await run(new AddItemTool(), { list: 'Groceries', name: 'Coffee' }, user)
    assert.isFalse(created.isError())
    const itemId = created.structuredValue<{ item: { id: number } }>().item.id

    // Soft-delete, then re-add the name: it should restore the same row.
    const item = await Item.findOrFail(itemId)
    item.deletedAt = DateTime.now()
    item.version += 1
    await item.save()

    const restored = await run(new AddItemTool(), { list: 'Groceries', name: 'coffee' }, user)
    assert.isFalse(restored.isError())
    const outcome = restored.structuredValue<{ action: string; item: { id: number } }>()
    assert.equal(outcome.action, 'restored')
    assert.equal(outcome.item.id, itemId)
  })

  test('add_item refuses a fresh create at the unchecked limit', async ({ assert }) => {
    const user = await makeUser('mcp-guards-3@example.com')
    const list = await makeList(user, 'Tiny', { maxUncheckedItems: 1 })
    await patFor(user, list)
    await Item.create({
      listId: list.id,
      name: 'Filler',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const response = await run(new AddItemTool(), { list: 'Tiny', name: 'New' }, user)
    assert.isTrue(response.isError())
  })

  test('add_item refuses reopening a checked item at the unchecked limit', async ({ assert }) => {
    const user = await makeUser('mcp-guards-4@example.com')
    const list = await makeList(user, 'Tiny', { maxUncheckedItems: 1 })
    await patFor(user, list)
    await Item.create({
      listId: list.id,
      name: 'Filler',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const checked = await Item.create({
      listId: list.id,
      name: 'Done',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })
    assert.isNotNull(checked.id)

    const response = await run(new AddItemTool(), { list: 'Tiny', name: 'Done' }, user)
    assert.isTrue(response.isError())
  })

  test('get_item distinguishes the item, a sub-task, and a missing sub-task', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-5@example.com')
    const list = await makeList(user, 'Packing', { useSubtasks: true })
    await patFor(user, list)
    const item = await Item.create({
      listId: list.id,
      name: 'Camera',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const sub = await SubItem.create({
      itemId: item.id,
      name: 'Charge it',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const parent = await run(new GetItemTool(), { list: 'Packing', itemId: item.id }, user)
    assert.isFalse(parent.isError())
    assert.equal(parent.structuredValue<{ item: { name: string } }>().item.name, 'Camera')

    const subTask = await run(
      new GetItemTool(),
      { list: 'Packing', itemId: item.id, subTaskId: sub.id },
      user
    )
    assert.isFalse(subTask.isError())
    assert.equal(subTask.structuredValue<{ subTask: { name: string } }>().subTask.name, 'Charge it')

    const missingSub = await run(
      new GetItemTool(),
      { list: 'Packing', itemId: item.id, subTaskId: 999999 },
      user
    )
    assert.isTrue(missingSub.isError())

    const missingItem = await run(new GetItemTool(), { list: 'Packing', itemId: 999999 }, user)
    assert.isTrue(missingItem.isError())

    // A list outside the token's grants is a denial (the `!outcome.ok` branch), not "missing".
    const ungranted = await run(new GetItemTool(), { list: 'No Such List', itemId: item.id }, user)
    assert.isTrue(ungranted.isError())
    assert.include(ungranted.textValue(), 'not found')
  })

  test('search_items scopes to one list and filters by checked state', async ({ assert }) => {
    const user = await makeUser('mcp-guards-6@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)
    await Item.create({
      listId: list.id,
      name: 'Milk',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    await Item.create({
      listId: list.id,
      name: 'Milk',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })

    // Scoped to one granted list by name: the closest match is returned.
    const scoped = await run(new SearchItemsTool(), { query: 'Milk', list: 'Groceries' }, user)
    assert.isFalse(scoped.isError())
    assert.equal(scoped.structuredValue<{ matches: unknown[] }>().matches.length, 1)

    // Open-only excludes the checked row; checked-only finds it.
    const open = await run(
      new SearchItemsTool(),
      { query: 'Milk', checked: false, list: 'Groceries' },
      user
    )
    assert.equal(open.structuredValue<{ matches: unknown[] }>().matches.length, 1)
    const done = await run(
      new SearchItemsTool(),
      { query: 'Milk', checked: true, list: 'Groceries' },
      user
    )
    assert.equal(done.structuredValue<{ matches: unknown[] }>().matches.length, 1)

    // Scoping to an ungranted list is an error, not an empty result.
    const ungranted = await run(
      new SearchItemsTool(),
      { query: 'Milk', list: 'No Such List' },
      user
    )
    assert.isTrue(ungranted.isError())
  })

  test('create_list refuses a missing name and otherwise creates an owned list', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-7@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)

    const nameless = await run(new CreateListTool(), {}, user)
    assert.isTrue(nameless.isError())

    const created = await run(new CreateListTool(), { name: 'Gift Ideas' }, user)
    assert.isFalse(created.isError())
    assert.equal(created.structuredValue<{ list: { name: string } }>().list.name, 'Gift Ideas')
  })

  test('remove/update/complete/uncomplete/add_subtask report a missing item', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-8@example.com')
    const list = await makeList(user, 'Packing', { useSubtasks: true })
    await patFor(user, list)

    for (const [tool, args] of [
      [new RemoveItemTool(), { list: 'Packing', itemId: 999999 }],
      [new UpdateItemTool(), { list: 'Packing', itemId: 999999, notes: 'x' }],
      [new CompleteItemTool(), { list: 'Packing', itemId: 999999 }],
      [new UncompleteItemTool(), { list: 'Packing', itemId: 999999 }],
      [new AddSubtaskTool(), { list: 'Packing', itemId: 999999, name: 'x' }],
    ] as const) {
      const response = await run(tool, args, user)
      assert.isTrue(response.isError(), `${tool.name} should report a missing item`)
    }
  })

  test('add_subtask refuses when the feature is off', async ({ assert }) => {
    const user = await makeUser('mcp-guards-9@example.com')
    const list = await makeList(user, 'Groceries', { useSubtasks: false })
    await patFor(user, list)
    const item = await Item.create({
      listId: list.id,
      name: 'Milk',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const response = await run(
      new AddSubtaskTool(),
      { list: 'Groceries', itemId: item.id, name: 'x' },
      user
    )
    assert.isTrue(response.isError())
    assert.include(response.textValue(), 'turned off')
  })

  test('uncomplete refuses at the unchecked limit', async ({ assert }) => {
    const user = await makeUser('mcp-guards-10@example.com')
    const list = await makeList(user, 'Tiny', { maxUncheckedItems: 1 })
    await patFor(user, list)
    await Item.create({
      listId: list.id,
      name: 'Filler',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    const done = await Item.create({
      listId: list.id,
      name: 'Done',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })

    const response = await run(new UncompleteItemTool(), { list: 'Tiny', itemId: done.id }, user)
    assert.isTrue(response.isError())
  })

  test('a viewer-granted token is refused by every write tool', async ({ assert }) => {
    const user = await makeUser('mcp-guards-11@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list, 'viewer')
    const item = await Item.create({
      listId: list.id,
      name: 'Milk',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    for (const [tool, args] of [
      [new AddItemTool(), { list: 'Groceries', name: 'Eggs' }],
      [new UpdateItemTool(), { list: 'Groceries', itemId: item.id, notes: 'x' }],
      [new CompleteItemTool(), { list: 'Groceries', itemId: item.id }],
      [new UncompleteItemTool(), { list: 'Groceries', itemId: item.id }],
      [new RemoveItemTool(), { list: 'Groceries', itemId: item.id }],
      [new AddSubtaskTool(), { list: 'Groceries', itemId: item.id, name: 'x' }],
    ] as const) {
      const response = await run(tool, args, user)
      assert.isTrue(response.isError(), `${tool.name} should honour the viewer grant`)
      assert.include(response.textValue(), 'view access')
    }
  })

  test('a token with a stale grant (membership revoked) is treated as not-found', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-12@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)
    // Revoke the real membership but leave the token's grant naming the list.
    await ListMember.query().where('userId', user.id).where('listId', list.id).delete()

    const response = await run(new GetListTool(), { list: 'Groceries' }, user)
    assert.isTrue(response.isError())
    assert.include(response.textValue(), 'not found')
  })

  test('each list-scoped tool refuses when only one of list/itemId is present', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-13@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)

    // Every `!payload.list || typeof payload.itemId !== 'number'` guard needs a case where the
    // itemId is present but the list is missing, and vice versa.
    const cases: [unknown, Record<string, unknown>][] = [
      [new GetItemTool(), { itemId: 1 }],
      [new GetItemTool(), { list: 'Groceries' }],
      [new CompleteItemTool(), { itemId: 1 }],
      [new CompleteItemTool(), { list: 'Groceries' }],
      [new UncompleteItemTool(), { itemId: 1 }],
      [new UncompleteItemTool(), { list: 'Groceries' }],
      [new RemoveItemTool(), { itemId: 1 }],
      [new RemoveItemTool(), { list: 'Groceries' }],
      [new UpdateItemTool(), { itemId: 1 }],
      [new UpdateItemTool(), { list: 'Groceries' }],
      [new AddSubtaskTool(), { list: 'Groceries', itemId: 1 }],
      [new AddSubtaskTool(), { list: 'Groceries', name: 'x' }],
    ]
    for (const [tool, args] of cases) {
      const typed = asTool(tool)
      const response = await run(typed, args, user)
      assert.isTrue(response.isError(), `${typed.name} ${JSON.stringify(args)}`)
    }
  })

  test('add_item restores a deleted row, but refuses when the list is full', async ({ assert }) => {
    const user = await makeUser('mcp-guards-14@example.com')
    const list = await makeList(user, 'Tiny', { maxUncheckedItems: 1 })
    await patFor(user, list)
    // A deleted row and a live one filling the single slot.
    await Item.create({
      listId: list.id,
      name: 'Filler',
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })
    await Item.create({
      listId: list.id,
      name: 'Deleted',
      checked: false,
      deletedAt: DateTime.now(),
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })

    const response = await run(new AddItemTool(), { list: 'Tiny', name: 'Deleted' }, user)
    assert.isTrue(response.isError())
  })

  test('add_item honours an explicit categoryId on a fresh create', async ({ assert }) => {
    const user = await makeUser('mcp-guards-15@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)
    const category = await Category.create({
      listId: list.id,
      name: 'Dairy',
      icon: 'cheese',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const response = await run(
      new AddItemTool(),
      { list: 'Groceries', name: 'Yoghurt', categoryId: category.id },
      user
    )
    assert.isFalse(response.isError())
    assert.equal(
      response.structuredValue<{ item: { categoryId: number } }>().item.categoryId,
      category.id
    )
  })

  test('get_list can include checked items and add_subtask can succeed', async ({ assert }) => {
    const user = await makeUser('mcp-guards-16@example.com')
    const list = await makeList(user, 'Packing', { useSubtasks: true })
    await patFor(user, list)
    const item = await Item.create({
      listId: list.id,
      name: 'Camera',
      checked: true,
      checkedAt: DateTime.now(),
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    // Default (open-only) hides it; includeChecked surfaces it.
    const openOnly = await run(new GetListTool(), { list: 'Packing' }, user)
    assert.equal(openOnly.structuredValue<{ items: unknown[] }>().items.length, 0)
    const withChecked = await run(
      new GetListTool(),
      { list: 'Packing', includeChecked: true },
      user
    )
    assert.equal(withChecked.structuredValue<{ items: unknown[] }>().items.length, 1)

    // add_subtask on an open parent succeeds.
    const open = await Item.create({
      listId: list.id,
      name: 'Rope',
      checked: false,
      sortOrder: 1,
      createdBy: user.id,
      version: 1,
    })
    const sub = await run(
      new AddSubtaskTool(),
      { list: 'Packing', itemId: open.id, name: 'Coil it' },
      user
    )
    assert.isFalse(sub.isError())
    assert.equal(sub.structuredValue<{ subTask: { name: string } }>().subTask.name, 'Coil it')
    void item
  })

  test('tools tolerate a missing args object (the package always sends one, but be safe)', async ({
    assert,
  }) => {
    const user = await makeUser('mcp-guards-17@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)

    for (const tool of [
      new AddItemTool(),
      new AddSubtaskTool(),
      new CompleteItemTool(),
      new CreateListTool(),
      new GetItemTool(),
      new GetListTool(),
      new RemoveItemTool(),
      new SearchItemsTool(),
      new UncompleteItemTool(),
      new UpdateItemTool(),
    ]) {
      const response = await run(tool, undefined, user)
      assert.isTrue(response.isError(), `${tool.name} should reject empty args`)
    }
  })

  test('get_list returns categories for a list that has them', async ({ assert }) => {
    const user = await makeUser('mcp-guards-18@example.com')
    const list = await makeList(user, 'Groceries')
    await patFor(user, list)
    await Category.create({
      listId: list.id,
      name: 'Produce',
      icon: 'fruitCherries',
      sortOrder: 0,
      isDefault: false,
      version: 1,
    })

    const response = await run(new GetListTool(), { list: 'Groceries' }, user)
    assert.isFalse(response.isError())
    const categories = response.structuredValue<{ categories: { name: string }[] }>().categories
    assert.equal(categories.length, 1)
    assert.equal(categories[0]?.name, 'Produce')
  })

  test('complete/uncomplete report the spawned copy and the discarded undo', async ({ assert }) => {
    const user = await makeUser('mcp-guards-19@example.com')
    const list = await makeList(user, 'Chores')
    await patFor(user, list)
    const series = await ItemRecurrence.create({
      interval: 1,
      unit: 'week',
      weekdays: JSON.stringify([1]),
      startDate: '2026-09-28',
      endType: 'never',
      occurrencesCreated: 1,
    })
    const item = await Item.create({
      listId: list.id,
      name: 'Trash',
      deadline: '2026-09-28',
      recurrenceId: series.id,
      checked: false,
      sortOrder: 0,
      createdBy: user.id,
      version: 1,
    })

    const completed = await run(new CompleteItemTool(), { list: 'Chores', itemId: item.id }, user)
    assert.isFalse(completed.isError())
    assert.isNotNull(completed.structuredValue<{ spawned?: { name: string } }>().spawned)

    const undone = await run(new UncompleteItemTool(), { list: 'Chores', itemId: item.id }, user)
    assert.isFalse(undone.isError())
    assert.isNotNull(undone.structuredValue<{ undone?: { name: string } }>().undone)
  })
})
