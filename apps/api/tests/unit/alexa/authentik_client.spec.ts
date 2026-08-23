import { test } from '@japa/runner'
import { authentikClient } from '#services/alexa/authentik_client'

const ENV_KEYS = [
  'AUTHENTIK_TOKEN_URL',
  'AUTHENTIK_USERINFO_URL',
  'AUTHENTIK_CLIENT_ID',
  'AUTHENTIK_CLIENT_SECRET',
] as const

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test.group('authentikClient', (group) => {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  const originalFetch = globalThis.fetch

  group.each.teardown(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    globalThis.fetch = originalFetch
  })

  test('exchangeCode throws when its Authentik config is missing', async ({ assert }) => {
    delete process.env.AUTHENTIK_TOKEN_URL
    await assert.rejects(() => authentikClient.exchangeCode('code', 'https://layla.amazon.com/cb'))
  })

  test('exchangeCode throws when Authentik rejects the exchange', async ({ assert }) => {
    process.env.AUTHENTIK_TOKEN_URL = 'https://auth.example.com/token'
    process.env.AUTHENTIK_CLIENT_ID = 'everylist'
    process.env.AUTHENTIK_CLIENT_SECRET = 'secret'
    globalThis.fetch = (async () => jsonResponse(400, { error: 'invalid_grant' })) as typeof fetch

    await assert.rejects(() =>
      authentikClient.exchangeCode('bad-code', 'https://layla.amazon.com/cb')
    )
  })

  test('exchangeCode throws when the response has no access_token', async ({ assert }) => {
    process.env.AUTHENTIK_TOKEN_URL = 'https://auth.example.com/token'
    process.env.AUTHENTIK_CLIENT_ID = 'everylist'
    process.env.AUTHENTIK_CLIENT_SECRET = 'secret'
    globalThis.fetch = (async () => jsonResponse(200, {})) as typeof fetch

    await assert.rejects(() => authentikClient.exchangeCode('code', 'https://layla.amazon.com/cb'))
  })

  test('exchangeCode returns the access token on success', async ({ assert }) => {
    process.env.AUTHENTIK_TOKEN_URL = 'https://auth.example.com/token'
    process.env.AUTHENTIK_CLIENT_ID = 'everylist'
    process.env.AUTHENTIK_CLIENT_SECRET = 'secret'
    globalThis.fetch = (async () =>
      jsonResponse(200, { access_token: 'authentik-token' })) as typeof fetch

    const token = await authentikClient.exchangeCode('code', 'https://layla.amazon.com/cb')
    assert.equal(token, 'authentik-token')
  })

  test('fetchEmail throws when its Authentik config is missing', async ({ assert }) => {
    delete process.env.AUTHENTIK_USERINFO_URL
    await assert.rejects(() => authentikClient.fetchEmail('authentik-token'))
  })

  test('fetchEmail throws when Authentik rejects the request', async ({ assert }) => {
    process.env.AUTHENTIK_USERINFO_URL = 'https://auth.example.com/userinfo'
    globalThis.fetch = (async () => jsonResponse(401, {})) as typeof fetch

    await assert.rejects(() => authentikClient.fetchEmail('bad-token'))
  })

  test('fetchEmail throws when the response has no email', async ({ assert }) => {
    process.env.AUTHENTIK_USERINFO_URL = 'https://auth.example.com/userinfo'
    globalThis.fetch = (async () => jsonResponse(200, {})) as typeof fetch

    await assert.rejects(() => authentikClient.fetchEmail('token'))
  })

  test('fetchEmail returns the linked email on success', async ({ assert }) => {
    process.env.AUTHENTIK_USERINFO_URL = 'https://auth.example.com/userinfo'
    globalThis.fetch = (async () =>
      jsonResponse(200, { email: 'person@example.com' })) as typeof fetch

    const email = await authentikClient.fetchEmail('token')
    assert.equal(email, 'person@example.com')
  })
})
