import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { AccessTokenCreatedDto, AccessTokenDto, ListDto } from '@everylist/shared'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string, name = 'Test List') {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

async function mintToken(
  client: ApiClient,
  token: string,
  payload: { name: string; listIds: number[]; role: string }
): Promise<ApiResponse> {
  return client.post('/api/v1/tokens').header('Authorization', `Bearer ${token}`).json(payload)
}

async function mintTokenData(
  client: ApiClient,
  token: string,
  payload: { name: string; listIds: number[]; role: 'editor' | 'viewer' }
): Promise<AccessTokenCreatedDto> {
  return bodyData<AccessTokenCreatedDto>(await mintToken(client, token, payload))
}

test.group('Personal access tokens', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('an owner can mint a token scoped to several lists, list it, and revoke it', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'List A')
    const listBId = await createList(client, owner.token, 'List B')

    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listAId, listBId],
      role: 'editor',
    })
    assert.equal(created.name, 'Home Assistant')
    assert.sameDeepMembers(created.grants, [
      { listId: listAId, role: 'editor' },
      { listId: listBId, role: 'editor' },
    ])
    assert.isString(created.token)
    assert.match(created.token, /^elt_/)

    const index = await client
      .get('/api/v1/tokens')
      .header('Authorization', `Bearer ${owner.token}`)
    index.assertStatus(200)
    const listed = bodyData<AccessTokenDto[]>(index)[0]!
    assert.equal(listed.id, created.id)
    // The plaintext secret is never re-emitted after creation.
    assert.isUndefined((listed as AccessTokenCreatedDto).token)

    const revoke = await client
      .delete(`/api/v1/tokens/${created.id}`)
      .header('Authorization', `Bearer ${owner.token}`)
    revoke.assertStatus(204)

    const afterRevoke = await client
      .get('/api/v1/tokens')
      .header('Authorization', `Bearer ${owner.token}`)
    assert.lengthOf(bodyData<AccessTokenDto[]>(afterRevoke), 0)
  })

  test('an editor cannot mint a token', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const editor = await signupAndGetUser(client)
    await addMember(listId, editor.id, 'editor')

    const create = await mintToken(client, editor.token, {
      name: 'Sneaky',
      listIds: [listId],
      role: 'viewer',
    })
    create.assertStatus(403)
  })

  test('a viewer cannot mint a token', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const viewer = await signupAndGetUser(client)
    await addMember(listId, viewer.id, 'viewer')

    const create = await mintToken(client, viewer.token, {
      name: 'Sneaky',
      listIds: [listId],
      role: 'viewer',
    })
    create.assertStatus(403)
  })

  test('minting requires ownership of every requested list, not just some of them', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const ownedListId = await createList(client, owner.token, 'Owned')
    const otherOwner = await signupAndGetUser(client)
    // Owning list A plus mere editor membership on list B isn't enough —
    // minting must fail the same way requesting owner-only access to B
    // alone would.
    const notOwnedListId = await createList(client, otherOwner.token, 'Not owned')
    await addMember(notOwnedListId, owner.id, 'editor')

    const create = await mintToken(client, owner.token, {
      name: 'Partial',
      listIds: [ownedListId, notOwnedListId],
      role: 'editor',
    })
    create.assertStatus(403)
  })

  test('minting fails 404 when one of the requested lists doesn`t exist at all', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const ownedListId = await createList(client, owner.token, 'Owned')

    const create = await mintToken(client, owner.token, {
      name: 'Partial',
      listIds: [ownedListId, 999999],
      role: 'editor',
    })
    create.assertStatus(404)
  })

  test('minting rejects an owner-role request at the validator', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const create = await mintToken(client, owner.token, {
      name: 'Too much',
      listIds: [listId],
      role: 'owner',
    })
    create.assertStatus(422)
  })

  test('minting rejects an empty listIds array', async ({ client }) => {
    const owner = await signupAndGetUser(client)

    const create = await mintToken(client, owner.token, {
      name: 'Empty',
      listIds: [],
      role: 'editor',
    })
    create.assertStatus(422)
  })

  test('a duplicate listId is only granted once', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)

    const created = await mintTokenData(client, owner.token, {
      name: 'Deduped',
      listIds: [listId, listId],
      role: 'editor',
    })
    assert.deepEqual(created.grants, [{ listId, role: 'editor' }])
  })

  test('an editor-role token can read and write items on a granted list', async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listId],
      role: 'editor',
    })

    const store = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Milk' })
    store.assertStatus(200)
    assert.equal(store.body().data.name, 'Milk')

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
    index.assertStatus(200)
    assert.lengthOf(index.body().data, 1)
  })

  test('a token grants access to every list it was scoped to', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'List A')
    const listBId = await createList(client, owner.token, 'List B')
    const created = await mintTokenData(client, owner.token, {
      name: 'Multi',
      listIds: [listAId, listBId],
      role: 'editor',
    })

    const storeA = await client
      .post(`/api/v1/lists/${listAId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Milk' })
    storeA.assertStatus(200)

    const storeB = await client
      .post(`/api/v1/lists/${listBId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Screws' })
    storeB.assertStatus(200)
    assert.equal(storeB.body().data.name, 'Screws')
  })

  test('a viewer-role token can read but not write items on its granted list', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const created = await mintTokenData(client, owner.token, {
      name: 'Read only',
      listIds: [listId],
      role: 'viewer',
    })

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
    index.assertStatus(200)

    const store = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Milk' })
    store.assertStatus(403)
  })

  test('a token scoped to one list gets 404 against a different list the same user genuinely owns', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const grantedListId = await createList(client, owner.token, 'Granted List')
    const otherListId = await createList(client, owner.token, 'Other List')

    const created = await mintTokenData(client, owner.token, {
      name: 'Scoped',
      listIds: [grantedListId],
      role: 'editor',
    })

    const index = await client
      .get(`/api/v1/lists/${otherListId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
    index.assertStatus(404)

    const store = await client
      .post(`/api/v1/lists/${otherListId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Milk' })
    store.assertStatus(404)
  })

  test('a revoked token can no longer authenticate', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listId],
      role: 'editor',
    })

    await client
      .delete(`/api/v1/tokens/${created.id}`)
      .header('Authorization', `Bearer ${owner.token}`)

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
    index.assertStatus(401)
  })

  test('a user cannot revoke another user`s token', async ({ client }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listId],
      role: 'editor',
    })

    const stranger = await signupAndGetUser(client)
    const revoke = await client
      .delete(`/api/v1/tokens/${created.id}`)
      .header('Authorization', `Bearer ${stranger.token}`)
    revoke.assertStatus(404)
  })

  test('destroying an unknown token id returns 404', async ({ client }) => {
    const owner = await signupAndGetUser(client)

    const revoke = await client
      .delete('/api/v1/tokens/999999')
      .header('Authorization', `Bearer ${owner.token}`)
    revoke.assertStatus(404)
  })

  test('listing returns every token the user owns, across lists', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'List A')
    const listBId = await createList(client, owner.token, 'List B')
    await mintToken(client, owner.token, { name: 'For A', listIds: [listAId], role: 'editor' })
    await mintToken(client, owner.token, { name: 'For B', listIds: [listBId], role: 'editor' })

    const index = await client
      .get('/api/v1/tokens')
      .header('Authorization', `Bearer ${owner.token}`)
    const names = bodyData<AccessTokenDto[]>(index).map((t) => t.name)
    assert.sameMembers(names, ['For A', 'For B'])
  })

  test('a token`s effective role is capped if its owner is later downgraded on the list', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listId = await createList(client, owner.token)
    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listId],
      role: 'editor',
    })

    // Simulates the owner's own membership being downgraded after minting
    // (e.g. ownership transferred away) — bypasses the API's "must always
    // have an owner" guard on purpose, to isolate ListPolicy's own
    // grant-vs-membership capping from that unrelated invariant.
    const { default: ListMember } = await import('#models/list_member')
    const membership = await ListMember.query()
      .where('listId', listId)
      .where('userId', owner.id)
      .firstOrFail()
    membership.role = 'viewer'
    await membership.save()

    const index = await client
      .get(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
    index.assertStatus(200)

    const store = await client
      .post(`/api/v1/lists/${listId}/items`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ name: 'Milk' })
    store.assertStatus(403)
  })

  test('a token cannot reach a store solely through a list it has no grant on', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'List A')
    const listBId = await createList(client, owner.token, 'List B')
    const attachStore = await client
      .post(`/api/v1/lists/${listAId}/stores`)
      .header('Authorization', `Bearer ${owner.token}`)
      .json({ name: 'Walmart' })
    const storeId = attachStore.body().data.id

    const created = await mintTokenData(client, owner.token, {
      name: 'Scoped to B',
      listIds: [listBId],
      role: 'editor',
    })

    // The token is scoped to list B, which has no relation to the store —
    // even though the same *user* is a real member (owner) of list A, which
    // does. ListPolicy.storeRoleFor must not fall back to that membership.
    const attach = await client
      .post(`/api/v1/lists/${listBId}/stores`)
      .header('Authorization', `Bearer ${created.token}`)
      .json({ storeId })
    attach.assertStatus(404)
  })

  test('a token can introspect its own grants via /tokens/me', async ({ client, assert }) => {
    const owner = await signupAndGetUser(client)
    const listAId = await createList(client, owner.token, 'List A')
    const listBId = await createList(client, owner.token, 'List B')
    const created = await mintTokenData(client, owner.token, {
      name: 'Home Assistant',
      listIds: [listAId, listBId],
      role: 'editor',
    })

    const me = await client
      .get('/api/v1/tokens/me')
      .header('Authorization', `Bearer ${created.token}`)
    me.assertStatus(200)
    const view = bodyData<AccessTokenDto>(me)
    assert.equal(view.id, created.id)
    assert.equal(view.name, 'Home Assistant')
    assert.sameDeepMembers(view.grants, [
      { listId: listAId, role: 'editor' },
      { listId: listBId, role: 'editor' },
    ])
  })

  test('a login session cannot use /tokens/me — it has no per-list grant to report', async ({
    client,
  }) => {
    const owner = await signupAndGetUser(client)

    const me = await client
      .get('/api/v1/tokens/me')
      .header('Authorization', `Bearer ${owner.token}`)
    me.assertStatus(401)
  })

  test('/tokens/me requires authentication', async ({ client }) => {
    const me = await client.get('/api/v1/tokens/me')
    me.assertStatus(401)
  })
})

// `authorizeListChannel` (apps/api/start/transmit.ts) calls the same
// `ListPolicy.roleFor` path exercised by every test above (it's the
// function that decides whether a PAT gets scoped access at all), so its
// PAT-awareness is covered indirectly through those HTTP-level assertions.
// `start/**` is excluded from this workspace's coverage gate (.c8rc.json),
// and Transmit's own subscribe route isn't reachable through Japa's
// ApiClient (see the docstring in transmit.ts) — a dedicated test would
// need to hand-construct an HttpContext, which isn't worth the fragility
// for a five-line function whose only real logic is already covered.
