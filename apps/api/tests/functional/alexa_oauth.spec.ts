import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { ListDto } from '@everylist/shared'
import { authentikClient } from '#services/alexa/authentik_client'
import { addMember, bodyData, signupAndGetUser } from './helpers.js'

async function createList(client: ApiClient, token: string, name: string) {
  const response = await client
    .post('/api/v1/lists')
    .header('Authorization', `Bearer ${token}`)
    .json({ name })
  return bodyData<ListDto>(response).id
}

async function requestToken(
  client: ApiClient,
  body: Record<string, string>,
  auth?: { clientId: string; clientSecret: string }
): Promise<ApiResponse> {
  let request = client.post('/api/v1/alexa/oauth/token').form(body)
  if (auth) {
    const basic = Buffer.from(`${auth.clientId}:${auth.clientSecret}`).toString('base64')
    request = request.header('Authorization', `Basic ${basic}`)
  }
  return request
}

test.group('Alexa account-linking token exchange', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  // Amazon's account-linking config carries one client id/secret pair, presented both at
  // Authentik's own `/authorize` and at this bridge's "Access Token URI" — so this endpoint
  // authenticates the caller against the same AUTHENTIK_CLIENT_ID/SECRET the server-side
  // exchange uses, not a separate invented pair (see alexa_oauth_controller.ts).
  const originalClientId = process.env.AUTHENTIK_CLIENT_ID
  const originalClientSecret = process.env.AUTHENTIK_CLIENT_SECRET

  group.each.setup(() => {
    process.env.AUTHENTIK_CLIENT_ID = 'authentik-client-id'
    process.env.AUTHENTIK_CLIENT_SECRET = 'authentik-client-secret'
    return () => {
      if (originalClientId === undefined) delete process.env.AUTHENTIK_CLIENT_ID
      else process.env.AUTHENTIK_CLIENT_ID = originalClientId
      if (originalClientSecret === undefined) delete process.env.AUTHENTIK_CLIENT_SECRET
      else process.env.AUTHENTIK_CLIENT_SECRET = originalClientSecret
    }
  })

  group.each.setup(() => {
    const originalExchange = authentikClient.exchangeCode
    const originalFetchEmail = authentikClient.fetchEmail
    return () => {
      authentikClient.exchangeCode = originalExchange
      authentikClient.fetchEmail = originalFetchEmail
    }
  })

  test("rejects when Authentik's client isn't configured at all", async ({ client }) => {
    delete process.env.AUTHENTIK_CLIENT_ID
    const response = await requestToken(client, {
      grant_type: 'authorization_code',
      code: 'abc',
      redirect_uri: 'https://layla.amazon.com/cb',
    })
    response.assertStatus(401)
  })

  test('rejects a mismatched client secret sent via Basic auth', async ({ client }) => {
    const response = await requestToken(
      client,
      {
        grant_type: 'authorization_code',
        code: 'abc',
        redirect_uri: 'https://layla.amazon.com/cb',
      },
      { clientId: 'authentik-client-id', clientSecret: 'wrong' }
    )
    response.assertStatus(401)
  })

  test('rejects a mismatched client id sent in the body', async ({ client }) => {
    const response = await requestToken(client, {
      grant_type: 'authorization_code',
      code: 'abc',
      redirect_uri: 'https://layla.amazon.com/cb',
      client_id: 'not-us',
      client_secret: 'authentik-client-secret',
    })
    response.assertStatus(401)
  })

  test('rejects when the Authentik exchange itself fails', async ({ client }) => {
    authentikClient.exchangeCode = async () => {
      throw new Error('Authentik rejected the code')
    }

    const response = await requestToken(client, {
      grant_type: 'authorization_code',
      code: 'bad',
      redirect_uri: 'https://layla.amazon.com/cb',
      client_id: 'authentik-client-id',
      client_secret: 'authentik-client-secret',
    })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'invalid_grant' })
  })

  test('rejects when the linked email has no matching EveryList account', async ({ client }) => {
    authentikClient.exchangeCode = async () => 'authentik-token'
    authentikClient.fetchEmail = async () => 'nobody@example.com'

    const response = await requestToken(client, {
      grant_type: 'authorization_code',
      code: 'code',
      redirect_uri: 'https://layla.amazon.com/cb',
      client_id: 'authentik-client-id',
      client_secret: 'authentik-client-secret',
    })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'invalid_grant' })
  })

  test("mints a PAT scoped to the linked user's lists, capping owner/editor at editor", async ({
    client,
    assert,
  }) => {
    const owner = await signupAndGetUser(client)
    const viewerUser = await signupAndGetUser(client)
    const ownedListId = await createList(client, owner.token, 'Groceries')
    const viewerListId = await createList(client, viewerUser.token, 'Shared')
    await addMember(viewerListId, owner.id, 'viewer')

    authentikClient.exchangeCode = async () => 'authentik-token'

    // Look up the real email the signup helper generated for `owner`.
    const profile = await client
      .get('/api/v1/account/profile')
      .header('Authorization', `Bearer ${owner.token}`)
    const ownerEmail = bodyData<{ email: string }>(profile).email
    authentikClient.fetchEmail = async () => ownerEmail

    const response = await requestToken(client, {
      grant_type: 'authorization_code',
      code: 'code',
      redirect_uri: 'https://layla.amazon.com/cb',
      client_id: 'authentik-client-id',
      client_secret: 'authentik-client-secret',
    })
    response.assertStatus(200)
    assert.equal(response.body().token_type, 'bearer')
    assert.match(response.body().access_token, /^elt_/)

    const introspect = await client
      .get('/api/v1/tokens/me')
      .header('Authorization', `Bearer ${response.body().access_token}`)
    // `owner` also has an owner-role membership on the starter "Shopping List" signup creates
    // automatically (see #services/list_creation.ts) — assert the two lists this test cares
    // about are present with the right (capped) roles, rather than the full grant set.
    const grants = bodyData<{ grants: { listId: number; role: string }[] }>(introspect).grants
    assert.deepInclude(grants, { listId: ownedListId, role: 'editor' })
    assert.deepInclude(grants, { listId: viewerListId, role: 'viewer' })
  })
})
