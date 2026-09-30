import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import List from '#models/list'
import ListMember from '#models/list_member'
import Item from '#models/item'
import {
  McpListAccessError,
  McpToolError,
  grantedLists,
  itemProjection,
  requireGrantedList,
  resolveGrantedList,
  withListAccess,
} from '#services/mcp/access'
import { accessibleLists } from '#services/alexa/list_resolution'

async function makeUser(email: string) {
  return User.create({ fullName: 'Test User', email, password: 'password123' })
}

async function makeGrantedList(owner: User, name: string, role: 'owner' = 'owner') {
  const list = await List.create({ name, ownerId: owner.id })
  await ListMember.create({
    listId: list.id,
    userId: owner.id,
    role,
    invitedAt: DateTime.now(),
    acceptedAt: DateTime.now(),
  })
  return list
}

test.group('MCP access helpers', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('resolveGrantedList matches id and exact name within the token grants', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-1@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    const token = await User.personalAccessTokens.create(owner, [`list:${list.id}:editor`], {
      name: 't',
    })
    owner.currentAccessToken = token

    const byIdString = await resolveGrantedList(token, String(list.id))
    const byIdNumber = await resolveGrantedList(token, list.id)
    const byName = await resolveGrantedList(token, '  groceries ')
    assert.equal(byIdString?.id, list.id)
    assert.equal(byIdNumber?.id, list.id)
    assert.equal(byName?.id, list.id)
  })

  test('resolveGrantedList returns null for names outside the grants', async ({ assert }) => {
    const owner = await makeUser('mcp-access-2@example.com')
    const granted = await makeGrantedList(owner, 'Groceries')
    await makeGrantedList(owner, 'Secret Gifts')
    const token = await User.personalAccessTokens.create(owner, [`list:${granted.id}:editor`], {
      name: 't',
    })

    assert.isNull(await resolveGrantedList(token, 'Secret Gifts'))
    assert.isNull(await resolveGrantedList(token, 'Not A List'))
    // A number that isn't granted resolves to nothing too — id probing is dead.
    assert.isNull(await resolveGrantedList(token, 999999))
  })

  test('grantedLists mirrors accessibleLists and yields nothing without a token', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-3@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    const token = await User.personalAccessTokens.create(owner, [`list:${list.id}:viewer`], {
      name: 't',
    })

    const granted = await accessibleLists(token)
    assert.equal(granted.length, 1)
    assert.isNull(await resolveGrantedList(undefined, 'Groceries'))
    // The no-token guard on the grants lookup itself.
    assert.deepEqual(await grantedLists(undefined), [])
  })

  test('withListAccess surfaces McpToolError messages as failures', async ({ assert }) => {
    const refused = await withListAccess(async () => {
      throw new McpToolError('no capacity')
    })
    assert.isFalse(refused.ok)
    assert.equal(refused.ok ? '' : refused.error, 'no capacity')
  })

  test('withListAccess maps both access-denial kinds and rethrows anything else', async ({
    assert,
  }) => {
    const notFound = await withListAccess(async () => {
      throw new McpListAccessError('not_found')
    })
    assert.equal(
      notFound.ok ? '' : notFound.error,
      'List not found (or not granted to this token). Use list_lists first.'
    )

    const forbidden = await withListAccess(async () => {
      throw new McpListAccessError('forbidden')
    })
    assert.equal(
      forbidden.ok ? '' : forbidden.error,
      'Your token only has view access to this list.'
    )

    await assert.rejects(
      () =>
        withListAccess(async () => {
          throw new Error('boom')
        }),
      /boom/
    )
  })

  test('requireGrantedList translates both policy denials and a stale grant', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-4@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    const token = await User.personalAccessTokens.create(owner, [`list:${list.id}:viewer`], {
      name: 't',
    })
    owner.currentAccessToken = token

    // Viewer grant asking for editor: forbidden shape.
    await assert.rejects(() => requireGrantedList(owner, list.id, 'editor'), McpListAccessError)
    const forbidden = await requireGrantedList(owner, list.id, 'editor').catch((e) => e)
    assert.instanceOf(forbidden, McpListAccessError)
    assert.equal((forbidden as McpListAccessError).kind, 'forbidden')

    // A grant naming a list the account has left: not-found shape, never a raw policy error.
    await ListMember.query().where('userId', owner.id).where('listId', list.id).delete()
    const stale = await requireGrantedList(owner, list.id, 'viewer').catch((e) => e)
    assert.instanceOf(stale, McpListAccessError)
    assert.equal((stale as McpListAccessError).kind, 'not_found')
  })

  test('a non-granted list name is not-found, and an unknown token yields nothing', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-5@example.com')
    await makeGrantedList(owner, 'Groceries')
    const token = await User.personalAccessTokens.create(owner, ['list:999999:editor'], {
      name: 't',
    })
    owner.currentAccessToken = token

    const missing = await requireGrantedList(owner, 'Groceries').catch((e) => e)
    assert.instanceOf(missing, McpListAccessError)
    assert.equal((missing as McpListAccessError).kind, 'not_found')
    assert.equal(await resolveGrantedList(undefined, 'Groceries'), null)
  })

  test('itemProjection carries the tool-relevant fields and sub-tasks', async ({ assert }) => {
    const owner = await makeUser('mcp-access-3@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    const item = await Item.create({
      listId: list.id,
      name: 'Milk',
      price: 2.5,
      quantity: '2',
      notes: 'whole',
      checked: false,
      sortOrder: 0,
      createdBy: owner.id,
      version: 1,
    })

    const projection = itemProjection(item)
    assert.equal(projection.name, 'Milk')
    assert.equal(projection.price, 2.5)
    assert.equal(projection.subItems, undefined)
    await item.load('subItems')
    assert.deepEqual(itemProjection(item).subItems, [])
  })
})
