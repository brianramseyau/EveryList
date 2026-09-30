import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { AccessTokenCreatedDto, ListDto } from '@everylist/shared'
import { bodyData, signupAndGetUser } from './helpers.js'

/**
 * Functional tests for the MCP surface (foundational/PLAN_32_PHASE_MCP_SERVER.md): the JSON-RPC
 * endpoint's auth, protocol-middleware branches, and the tools' observable behavior — through
 * real minted PATs, exactly the credential a real MCP client holds.
 *
 * Modern-era (`2026-07-28`) requests are stateless but must carry routing headers that match
 * their body (see @jrmc/adonis-mcp's `validateModernHttpHeaders`): `MCP-Protocol-Version`
 * matching `params._meta`, `Mcp-Method` matching `method`, and `Mcp-Name` matching
 * `params.name`/`params.uri` for tools/call and resources/read.
 */

const PROTOCOL_VERSION = '2026-07-28'

type JsonRpcBody = {
  jsonrpc: string
  id: number
  result?: {
    content?: { type: string; text: string }[]
    structuredContent?: unknown
    isError?: boolean
    tools?: { name: string; description?: string }[]
    contents?: { uri: string; mimeType: string; text: string }[]
  }
  error?: { code: number; message: string }
}

function modernMeta(name = 'japa'): Record<string, unknown> {
  return {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name, version: '0' },
    },
  }
}

/** A modern-era JSON-RPC call with the routing headers the protocol layer requires. */
function mcpPost(
  client: ApiClient,
  token: string | null,
  method: string,
  params: Record<string, unknown>,
  name?: string
) {
  const request = client
    .post('/mcp')
    .header('MCP-Protocol-Version', PROTOCOL_VERSION)
    .header('Mcp-Method', method)
  if (name) request.header('Mcp-Name', name)
  if (token) request.header('Authorization', `Bearer ${token}`)
  return request.json({ jsonrpc: '2.0', id: 1, method, params: { ...params, ...modernMeta() } })
}

function discover(client: ApiClient, token: string) {
  return mcpPost(client, token, 'server/discover', {})
}

function listTools(client: ApiClient, token: string) {
  return mcpPost(client, token, 'tools/list', {})
}

function callTool(client: ApiClient, token: string, name: string, args: Record<string, unknown>) {
  return mcpPost(client, token, 'tools/call', { name, arguments: args }, name)
}

function readResource(client: ApiClient, token: string, uri: string) {
  return mcpPost(client, token, 'resources/read', { uri }, uri)
}

function body(response: ApiResponse): JsonRpcBody {
  return response.body() as JsonRpcBody
}

function structured<T>(response: ApiResponse): T {
  const result = body(response).result
  if (!result) throw new Error(`no result: ${response.text()}`)
  if (body(response).error) throw new Error(JSON.stringify(body(response).error))
  return result.structuredContent as T
}

function contentText(response: ApiResponse): string {
  return (body(response).result?.content ?? []).map((content) => content.text).join('\n')
}

/** Signs up a fresh account, creates a list, and mints a PAT scoped to it — the real self-hoster
 * flow (minting requires being every granted list's owner, so one account does both). */
async function userWithPat(client: ApiClient, role: 'editor' | 'viewer', listName = 'Groceries') {
  const user = await signupAndGetUser(client)
  const listId = await makeList(client, user.token, listName)
  const response = await client
    .post('/api/v1/tokens')
    .header('Authorization', `Bearer ${user.token}`)
    .json({ name: 'mcp tests', listIds: [listId], role })
  return {
    token: bodyData<AccessTokenCreatedDto>(response).token,
    user,
    listId,
    listName,
  }
}

async function makeList(client: ApiClient, token: string, name = 'Groceries') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

test.group('MCP server', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('rejects unauthenticated calls with 401 through the pat-only guard', async ({
    client,
    assert,
  }) => {
    const response = await discover(client, 'not-a-real-token')

    response.assertStatus(401)
    assert.include(response.text(), 'Unauthorized access')
  })

  test('a login-session token cannot use the MCP surface (pat guard only)', async ({ client }) => {
    const user = await signupAndGetUser(client)
    const response = await discover(client, user.token)

    // The `pat` guard is the only one allowed: a login token presents the same bearer header,
    // but authenticateUsing(['pat']) refuses it with exactly this shape.
    response.assertStatus(401)
  })

  test('the protocol middleware rejects non-JSON content types', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    const response = await client
      .post('/mcp')
      .header('Authorization', `Bearer ${user.token}`)
      .header('Content-Type', 'text/plain')
      .send()

    response.assertStatus(400)
    assert.include(response.text(), 'Content-Type header must be application/json')
  })

  test('server/discover reports EveryList as the server identity', async ({ client, assert }) => {
    const { token } = await userWithPat(client, 'editor')
    const response = await discover(client, token)

    response.assertStatus(200)
    assert.equal((body(response).result as { _meta?: unknown }) !== undefined, true)
    assert.include(response.text(), '"name":"everylist"')
  })

  test('answers tools/list with every curated tool', async ({ client, assert }) => {
    const { token } = await userWithPat(client, 'editor')
    const response = await listTools(client, token)

    response.assertStatus(200)
    const tools = body(response).result?.tools ?? []
    assert.sameMembers(
      tools.map((tool) => tool.name),
      [
        'add_item',
        'add_subtask',
        'complete_item',
        'create_list',
        'get_item',
        'get_list',
        'list_lists',
        'remove_item',
        'search_items',
        'uncomplete_item',
        'update_item',
      ]
    )
    for (const tool of tools) assert.isString(tool.description ?? '')
  })

  test('list_lists reports the token-scoped lists and their open-item counts', async ({
    client,
    assert,
  }) => {
    const { token, listId, listName } = await userWithPat(client, 'editor')
    await callTool(client, token, 'add_item', { list: listName, name: 'Oat milk' })

    const response = await callTool(client, token, 'list_lists', {})
    response.assertStatus(200)
    const { lists } = structured<{
      lists: { id: number; name: string; archived: boolean; openItems: number }[]
    }>(response)
    assert.equal(lists.length, 1)
    assert.equal(lists[0]?.id, listId)
    assert.equal(lists[0]?.openItems, 1)
  })

  test('add_item creates, re-adds as reopened, and get_list reads it back', async ({
    client,
    assert,
  }) => {
    const { token, listId, listName } = await userWithPat(client, 'editor')

    const added = await callTool(client, token, 'add_item', {
      list: listName,
      name: 'Oat milk',
      quantity: '1 L',
    })
    added.assertStatus(200)
    const created = structured<{
      action: string
      item: { id: number; name: string; quantity: string | null; checked: boolean }
      list: { id: number }
    }>(added)
    assert.equal(created.action, 'created')
    assert.equal(created.item.name, 'Oat milk')
    assert.equal(created.item.quantity, '1 L')
    assert.equal(created.list.id, listId)

    // Same name again while it's already open: get-or-create, nothing changes, not duplicated.
    const again = await callTool(client, token, 'add_item', {
      list: listName,
      name: 'oat milk',
    })
    const reopened = structured<{ action: string; item: { id: number } }>(again)
    assert.equal(reopened.action, 'already-open')
    assert.equal(reopened.item.id, created.item.id)

    // Complete it, then re-add the name: the checked row is reopened (not duplicated).
    await callTool(client, token, 'complete_item', {
      list: listName,
      itemId: created.item.id,
    })
    const revived = await callTool(client, token, 'add_item', { list: listName, name: 'Oat milk' })
    const revivedBody = structured<{ action: string; item: { id: number; checked: boolean } }>(
      revived
    )
    assert.equal(revivedBody.action, 'reopened')
    assert.equal(revivedBody.item.id, created.item.id)
    assert.isFalse(revivedBody.item.checked)

    const read = await callTool(client, token, 'get_list', { list: listName })
    const view = structured<{
      list: { id: number; name: string }
      categories: { id: number; name: string }[]
      items: { id: number; checked: boolean }[]
    }>(read)
    assert.equal(view.list.id, listId)
    assert.equal(view.items.length, 1)
    assert.isFalse((view.items[0] ?? { checked: true }).checked)
  })

  test('get_item returns one item, or one sub-task of it', async ({ client, assert }) => {
    const { token, listName } = await userWithPat(client, 'editor')
    const added = await callTool(client, token, 'add_item', {
      list: listName,
      name: 'Camera',
      notes: 'mirrorless',
    })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    const detail = await callTool(client, token, 'get_item', { list: listName, itemId })
    detail.assertStatus(200)
    assert.equal(
      structured<{ item: { name: string; notes: string } }>(detail).item.notes,
      'mirrorless'
    )

    const missing = await callTool(client, token, 'get_item', { list: listName, itemId: 999999 })
    assert.isTrue(body(missing).result?.isError ?? false)
    assert.include(contentText(missing), 'Item not found')
  })

  test('complete and uncomplete round-trip an item through the checkbox gates', async ({
    client,
    assert,
  }) => {
    const { token, listName } = await userWithPat(client, 'editor', 'Chores')
    const added = await callTool(client, token, 'add_item', { list: listName, name: 'Trash' })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    const completed = await callTool(client, token, 'complete_item', { list: listName, itemId })
    completed.assertStatus(200)
    assert.isTrue(structured<{ item: { checked: boolean } }>(completed).item.checked)

    const reopened = await callTool(client, token, 'uncomplete_item', { list: listName, itemId })
    reopened.assertStatus(200)
    assert.isFalse(structured<{ item: { checked: boolean } }>(reopened).item.checked)

    // Completing an already-complete item is a no-op, not an error.
    const noop = await callTool(client, token, 'complete_item', { list: listName, itemId })
    assert.isTrue(structured<{ item: { checked: boolean } }>(noop).item.checked)

    const missing = await callTool(client, token, 'complete_item', {
      list: listName,
      itemId: 999999,
    })
    assert.include(contentText(missing), 'Item not found')
  })

  test('a viewer-granted token can read but is refused on write tools', async ({
    client,
    assert,
  }) => {
    const { token, listId, listName } = await userWithPat(client, 'viewer')

    const read = await callTool(client, token, 'get_list', { list: listName })
    read.assertStatus(200)
    assert.equal(structured<{ list: { id: number } }>(read).list.id, listId)

    const write = await callTool(client, token, 'add_item', {
      list: listName,
      name: 'Oat milk',
    })
    write.assertStatus(200)
    assert.isTrue(body(write).result?.isError ?? false)
    assert.include(contentText(write), 'view access')
  })

  test('a list outside the token grants is indistinguishable from a nonexistent one', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const grantedListId = await makeList(client, user.token, 'Groceries')
    await makeList(client, user.token, 'Secret Gifts')
    const response = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [grantedListId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(response).token

    for (const target of ['Secret Gifts', 'No Such List']) {
      const read = await callTool(client, token, 'get_list', { list: target })
      read.assertStatus(200)
      assert.isTrue(body(read).result?.isError ?? false)
      assert.include(contentText(read), 'List not found (or not granted to this token)')
    }
  })

  test('remove_item soft-deletes and add_item restores the row with its metadata', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Groceries')
    // Seed via REST so the row carries metadata an MCP add wouldn't set.
    const seeded = await (async () => {
      const response = await client
        .post(`/api/v1/lists/${listId}/items`)
        .header('Authorization', `Bearer ${user.token}`)
        .json({ name: 'Coffee', notes: 'whole beans' })
      return bodyData<{ id: number; notes: string | null }>(response)
    })()
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const removed = await callTool(client, token, 'remove_item', {
      list: 'Groceries',
      itemId: seeded.id,
    })
    removed.assertStatus(200)
    assert.equal(structured<{ removed: { id: number } }>(removed).removed.id, seeded.id)

    const restored = await callTool(client, token, 'add_item', {
      list: 'Groceries',
      name: 'Coffee',
    })
    restored.assertStatus(200)
    const outcome = structured<{ action: string; item: { id: number; notes: string | null } }>(
      restored
    )
    assert.equal(outcome.action, 'restored')
    assert.equal(outcome.item.id, seeded.id)
    assert.equal(outcome.item.notes, 'whole beans')

    const missing = await callTool(client, token, 'remove_item', {
      list: 'Groceries',
      itemId: 999999,
    })
    assert.include(contentText(missing), 'Item not found')
  })

  test('update_item edits fields in place and refuses a no-field call', async ({
    client,
    assert,
  }) => {
    const { token, listName } = await userWithPat(client, 'editor', 'Chores')
    const added = await callTool(client, token, 'add_item', { list: listName, name: 'Batteries' })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    const updated = await callTool(client, token, 'update_item', {
      list: listName,
      itemId,
      notes: 'AA x4',
      price: 6.5,
    })
    updated.assertStatus(200)
    const item = structured<{ item: { id: number; notes: string; price: number } }>(updated).item
    assert.equal(item.id, itemId)
    assert.equal(item.notes, 'AA x4')
    assert.equal(item.price, 6.5)

    const empty = await callTool(client, token, 'update_item', { list: listName, itemId })
    assert.include(contentText(empty), 'Nothing to update')
  })

  test('add_subtask is feature-gated, and adds to an open parent when enabled', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Packing')
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token
    const added = await callTool(client, token, 'add_item', { list: 'Packing', name: 'Camera' })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    // Sub-tasks default off: refused before any lookup.
    const gated = await callTool(client, token, 'add_subtask', {
      list: 'Packing',
      itemId,
      name: 'Charge it',
    })
    assert.include(contentText(gated), 'turned off')

    // Turn the feature on (owner) and succeed.
    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ useSubtasks: true })
    const addedSub = await callTool(client, token, 'add_subtask', {
      list: 'Packing',
      itemId,
      name: 'Charge it',
    })
    addedSub.assertStatus(200)
    const sub = structured<{ subTask: { name: string }; parentItem: { id: number } }>(addedSub)
    assert.equal(sub.subTask.name, 'Charge it')
    assert.equal(sub.parentItem.id, itemId)
  })

  test('search_items fuzzily finds items across granted lists', async ({ client, assert }) => {
    const { token, listName } = await userWithPat(client, 'editor')
    await callTool(client, token, 'add_item', { list: listName, name: 'Ground coffee' })

    const found = await callTool(client, token, 'search_items', { query: 'ground cofee' })
    found.assertStatus(200)
    const { matches } = structured<{ matches: { listName: string; name: string }[] }>(found)
    assert.equal(matches.length, 1)
    assert.equal(matches[0]?.name, 'Ground coffee')
    assert.equal(matches[0]?.listName, listName)

    const none = await callTool(client, token, 'search_items', { query: 'zzzzzzzz' })
    assert.equal(structured<{ matches: unknown[] }>(none).matches.length, 0)
  })

  test('create_list creates an owned list that this token is not granted', async ({
    client,
    assert,
  }) => {
    const { token } = await userWithPat(client, 'editor')
    const created = await callTool(client, token, 'create_list', { name: 'Gift Ideas' })
    created.assertStatus(200)
    const bodyResult = structured<{ list: { name: string }; tokenGrants: string }>(created)
    assert.equal(bodyResult.list.name, 'Gift Ideas')
    assert.equal(bodyResult.tokenGrants, 'not-granted')

    // Reading the new list through this token is refused (404-shaped: no probing).
    const read = await callTool(client, token, 'get_list', { list: 'Gift Ideas' })
    assert.isTrue(body(read).result?.isError ?? false)
  })

  test('legacy-era clients keep the initialize lifecycle via MCP-Session-Id', async ({
    client,
    assert,
  }) => {
    const { token } = await userWithPat(client, 'viewer', 'Groceries')

    const init = await client
      .post('/mcp')
      .header('Authorization', `Bearer ${token}`)
      .json({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'legacy', version: '0' },
        },
      })
    init.assertStatus(200)
    // Legacy era keeps the initialize/session lifecycle: the response hands out a session id.
    assert.isString(init.header('mcp-session-id') ?? undefined)

    const sessionless = await client
      .post('/mcp')
      .header('Authorization', `Bearer ${token}`)
      .json({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    sessionless.assertStatus(400)
    assert.include(sessionless.text(), 'MCP-Session-Id header is required')

    // A legacy request that DOES carry the session id is echoed it back and served.
    const withSession = await client
      .post('/mcp')
      .header('Authorization', `Bearer ${token}`)
      .header('MCP-Session-Id', 'legacy-session-1')
      .json({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
    withSession.assertStatus(200)
    assert.equal(withSession.header('mcp-session-id'), 'legacy-session-1')
  })

  test('resources read exposes list contents behind the same pat gate', async ({
    client,
    assert,
  }) => {
    const { token, listId, listName } = await userWithPat(client, 'editor')
    await callTool(client, token, 'add_item', { list: listName, name: 'Oranges' })

    const read = await readResource(client, token, `everylist://lists/${listId}`)
    read.assertStatus(200)
    const contents = body(read).result?.contents ?? []
    const rawText = (contents[0] ?? { text: '' }).text
    if (!rawText) throw new Error(`resources/read returned no content: ${read.text()}`)
    const payload = JSON.parse(rawText) as { list: { id: number }; items: { name: string }[] }
    assert.equal(payload.list.id, listId)
    assert.equal(payload.items.length, 1)
    assert.equal(payload.items[0]?.name, 'Oranges')
  })

  test('a resource read for an ungranted list reports not-found wording', async ({
    client,
    assert,
  }) => {
    const { token } = await userWithPat(client, 'viewer', 'Groceries')
    const read = await readResource(client, token, 'everylist://lists/999999')
    read.assertStatus(200)
    const contents = body(read).result?.contents ?? []
    assert.include((contents[0] ?? { text: '' }).text, 'List not found')
  })

  test('argument guards fail loudly without touching the database', async ({ client, assert }) => {
    const { token } = await userWithPat(client, 'editor')
    // Each tool's required-argument guard, exercised through a real call.
    const cases: [string, Record<string, unknown>][] = [
      ['add_item', {}],
      ['get_list', {}],
      ['get_item', { list: 'Groceries' }],
      ['complete_item', { list: 'Groceries' }],
      ['uncomplete_item', {}],
      ['remove_item', {}],
      ['update_item', { list: 'Groceries' }],
      ['add_subtask', { list: 'Groceries' }],
      ['search_items', { list: 'Groceries' }],
      ['create_list', {}],
    ]
    for (const [name, args] of cases) {
      const response = await callTool(client, token, name, args)
      response.assertStatus(200)
      assert.isTrue(body(response).result?.isError ?? false, `${name} should have errored`)
    }
  })

  test('add_item is refused at the open-item limit, and re-adding a checked name too', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Tiny')
    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ maxUncheckedItems: 1 })
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const first = await callTool(client, token, 'add_item', { list: 'Tiny', name: 'One' })
    assert.isFalse(body(first).result?.isError ?? false)
    const oneId = structured<{ item: { id: number } }>(first).item.id

    // The single slot is full: a fresh name is refused.
    const second = await callTool(client, token, 'add_item', { list: 'Tiny', name: 'Two' })
    assert.include(contentText(second), 'only 1 open item')

    // Complete the open item to free the slot, add a different name into it, then re-add the
    // checked name — reopening it would exceed the limit, so the uncheck gate refuses it.
    await callTool(client, token, 'complete_item', { list: 'Tiny', itemId: oneId })
    const third = await callTool(client, token, 'add_item', { list: 'Tiny', name: 'Two' })
    assert.isFalse(body(third).result?.isError ?? false)

    const readd = await callTool(client, token, 'add_item', { list: 'Tiny', name: 'One' })
    assert.include(contentText(readd), 'before unchecking')
  })

  test('complete_item is refused while the list has open sub-tasks', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Packing')
    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ useSubtasks: true })
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const added = await callTool(client, token, 'add_item', { list: 'Packing', name: 'Camera' })
    const itemId = structured<{ item: { id: number } }>(added).item.id
    await callTool(client, token, 'add_subtask', { list: 'Packing', itemId, name: 'Charge it' })

    const blocked = await callTool(client, token, 'complete_item', { list: 'Packing', itemId })
    assert.include(contentText(blocked), 'remaining sub-task')
  })

  test('uncomplete_item is a no-op on an already-open item and refuses a missing one', async ({
    client,
    assert,
  }) => {
    const { token, listName } = await userWithPat(client, 'editor', 'Chores')
    const added = await callTool(client, token, 'add_item', { list: listName, name: 'Trash' })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    const noop = await callTool(client, token, 'uncomplete_item', { list: listName, itemId })
    assert.isFalse(structured<{ item: { checked: boolean } }>(noop).item.checked)

    const missing = await callTool(client, token, 'uncomplete_item', {
      list: listName,
      itemId: 999999,
    })
    assert.include(contentText(missing), 'Item not found')
  })

  test('search_items honours the checked filter and list scoping', async ({ client, assert }) => {
    const { token, listName } = await userWithPat(client, 'editor')
    const added = await callTool(client, token, 'add_item', { list: listName, name: 'Milk' })
    const itemId = structured<{ item: { id: number } }>(added).item.id
    await callTool(client, token, 'complete_item', { list: listName, itemId })

    // checked=false excludes the completed row; checked=true finds it.
    const openOnly = await callTool(client, token, 'search_items', {
      query: 'Milk',
      checked: false,
    })
    assert.equal(structured<{ matches: unknown[] }>(openOnly).matches.length, 0)
    const checkedOnly = await callTool(client, token, 'search_items', {
      query: 'Milk',
      checked: true,
    })
    assert.equal(structured<{ matches: unknown[] }>(checkedOnly).matches.length, 1)

    // Scoping to an ungranted list surfaces the not-found wording.
    const ungranted = await callTool(client, token, 'search_items', {
      query: 'Milk',
      list: 'No Such List',
    })
    assert.include(contentText(ungranted), 'List not found')
  })

  test('add_subtask refuses a missing parent and a checked parent', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Packing')
    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ useSubtasks: true })
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const missing = await callTool(client, token, 'add_subtask', {
      list: 'Packing',
      itemId: 999999,
      name: 'X',
    })
    assert.include(contentText(missing), 'Item not found')

    const added = await callTool(client, token, 'add_item', { list: 'Packing', name: 'Camera' })
    const itemId = structured<{ item: { id: number } }>(added).item.id
    await callTool(client, token, 'complete_item', { list: 'Packing', itemId })
    const checkedParent = await callTool(client, token, 'add_subtask', {
      list: 'Packing',
      itemId,
      name: 'X',
    })
    assert.include(contentText(checkedParent), 'Uncheck this item')
  })

  test('get_item returns a chosen sub-task by id, and 404-shaped for a missing one', async ({
    client,
    assert,
  }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Packing')
    await client
      .patch(`/api/v1/lists/${listId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ useSubtasks: true })
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const added = await callTool(client, token, 'add_item', { list: 'Packing', name: 'Camera' })
    const itemId = structured<{ item: { id: number } }>(added).item.id
    const sub = await callTool(client, token, 'add_subtask', {
      list: 'Packing',
      itemId,
      name: 'Charge it',
    })
    const subTaskId = structured<{ subTask: { id: number } }>(sub).subTask.id

    const found = await callTool(client, token, 'get_item', {
      list: 'Packing',
      itemId,
      subTaskId,
    })
    assert.equal(structured<{ subTask: { name: string } }>(found).subTask.name, 'Charge it')

    const missingSub = await callTool(client, token, 'get_item', {
      list: 'Packing',
      itemId,
      subTaskId: 999999,
    })
    assert.include(contentText(missingSub), 'Item not found')
  })

  test('list_lists excludes archived lists unless asked for them', async ({ client, assert }) => {
    const user = await signupAndGetUser(client)
    const listId = await makeList(client, user.token, 'Groceries')
    const archivedId = await makeList(client, user.token, 'Old')
    await client
      .patch(`/api/v1/lists/${archivedId}`)
      .header('Authorization', `Bearer ${user.token}`)
      .json({ archived: true })
    const tokenResponse = await client
      .post('/api/v1/tokens')
      .header('Authorization', `Bearer ${user.token}`)
      .json({ name: 'scoped', listIds: [listId, archivedId], role: 'editor' })
    const token = bodyData<AccessTokenCreatedDto>(tokenResponse).token

    const active = await callTool(client, token, 'list_lists', {})
    assert.equal(structured<{ lists: { id: number }[] }>(active).lists.length, 1)

    const all = await callTool(client, token, 'list_lists', { includeArchived: true })
    assert.equal(structured<{ lists: { id: number }[] }>(all).lists.length, 2)
  })

  test('update_item can clear a field and is refused when the item has no grant', async ({
    client,
    assert,
  }) => {
    const { token, listName } = await userWithPat(client, 'editor', 'Chores')
    const added = await callTool(client, token, 'add_item', {
      list: listName,
      name: 'Batteries',
      notes: 'AA x4',
    })
    const itemId = structured<{ item: { id: number } }>(added).item.id

    const cleared = await callTool(client, token, 'update_item', {
      list: listName,
      itemId,
      notes: null,
    })
    assert.isNull(structured<{ item: { notes: string | null } }>(cleared).item.notes)
  })
})
