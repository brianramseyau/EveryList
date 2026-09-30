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

/** A PAT scoped to `abilities`, set as the user's `currentAccessToken` the way the guard does. */
async function withPat(user: User, abilities: string[]) {
  const token = await User.personalAccessTokens.create(user, abilities, { name: 't' })
  user.currentAccessToken = token
  return token
}

test.group('MCP access helpers', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('resolveGrantedList matches id and exact name within the token grants', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-1@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    await withPat(owner, [`list:${list.id}:editor`])

    const byIdString = await resolveGrantedList(owner, String(list.id))
    const byIdNumber = await resolveGrantedList(owner, list.id)
    const byName = await resolveGrantedList(owner, '  groceries ')
    assert.equal(byIdString?.id, list.id)
    assert.equal(byIdNumber?.id, list.id)
    assert.equal(byName?.id, list.id)
  })

  test('resolveGrantedList returns null for names outside the grants', async ({ assert }) => {
    const owner = await makeUser('mcp-access-2@example.com')
    const granted = await makeGrantedList(owner, 'Groceries')
    await makeGrantedList(owner, 'Secret Gifts')
    await withPat(owner, [`list:${granted.id}:editor`])

    assert.isNull(await resolveGrantedList(owner, 'Secret Gifts'))
    assert.isNull(await resolveGrantedList(owner, 'Not A List'))
    // A number that isn't granted resolves to nothing too — id probing is dead.
    assert.isNull(await resolveGrantedList(owner, 999999))
  })

  test('a name matching two granted lists is refused as ambiguous', async ({ assert }) => {
    // Two *different* accounts each own a "Groceries" list (the per-owner name constraint
    // allows this), and the user is a member of both.
    const owner = await makeUser('mcp-access-ambiguous@example.com')
    const other = await makeUser('mcp-access-ambiguous-2@example.com')
    const first = await makeGrantedList(owner, 'Groceries')
    const shared = await List.create({ name: 'Groceries', ownerId: other.id })
    await ListMember.create({
      listId: shared.id,
      userId: owner.id,
      role: 'editor',
      invitedAt: DateTime.now(),
      acceptedAt: DateTime.now(),
    })
    await withPat(owner, [`list:${first.id}:editor`, `list:${shared.id}:editor`])

    const ambiguous = await resolveGrantedList(owner, 'Groceries').catch((error) => error)
    assert.instanceOf(ambiguous, McpListAccessError)
    assert.equal((ambiguous as McpListAccessError).kind, 'ambiguous')
    assert.sameMembers((ambiguous as McpListAccessError).listIds, [first.id, shared.id])

    // The id form disambiguates.
    const byId = await resolveGrantedList(owner, shared.id)
    assert.equal(byId?.id, shared.id)
  })

  test('grantedLists requires the user be a current accepted member, not just granted', async ({
    assert,
  }) => {
    const owner = await makeUser('mcp-access-3@example.com')
    const list = await makeGrantedList(owner, 'Groceries')
    await withPat(owner, [`list:${list.id}:viewer`])

    const granted = await grantedLists(owner)
    assert.equal(granted.length, 1)

    // Revoking membership hides the list even though the grant still names it.
    await ListMember.query().where('userId', owner.id).where('listId', list.id).delete()
    assert.deepEqual(await grantedLists(owner), [])

    // And a user with no token at all sees nothing.
    const bare = await makeUser('mcp-access-bare@example.com')
    assert.deepEqual(await grantedLists(bare), [])
  })

  test('withListAccess surfaces McpToolError messages as failures', async ({ assert }) => {
    const refused = await withListAccess(async () => {
      throw new McpToolError('no capacity')
    })
    assert.isFalse(refused.ok)
    assert.equal(refused.ok ? '' : refused.error, 'no capacity')
  })

  test('withListAccess maps all three access-denial kinds and rethrows anything else', async ({
    assert,
  }) => {
    const notFound = await withListAccess(async () => {
      throw new McpListAccessError('not_found')
    })
    assert.include(notFound.ok ? '' : notFound.error, 'List not found')

    const forbidden = await withListAccess(async () => {
      throw new McpListAccessError('forbidden')
    })
    assert.equal(
      forbidden.ok ? '' : forbidden.error,
      'Your token only has view access to this list.'
    )

    const ambiguous = await withListAccess(async () => {
      throw new McpListAccessError('ambiguous', [1, 2])
    })
    assert.include(ambiguous.ok ? '' : ambiguous.error, 'More than one list has that name')

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
    await withPat(owner, [`list:${list.id}:viewer`])

    // Viewer grant asking for editor: forbidden shape.
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
    await withPat(owner, ['list:999999:editor'])

    const missing = await requireGrantedList(owner, 'Groceries').catch((e) => e)
    assert.instanceOf(missing, McpListAccessError)
    assert.equal((missing as McpListAccessError).kind, 'not_found')
    assert.isNull(await resolveGrantedList(owner, 'Groceries'))
  })

  test('itemProjection carries the tool-relevant fields and sub-tasks', async ({ assert }) => {
    const owner = await makeUser('mcp-access-6@example.com')
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
