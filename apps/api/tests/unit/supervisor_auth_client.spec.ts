import { test } from '@japa/runner'
import {
  supervisorAuthClient,
  SupervisorAuthUnavailableError,
} from '#services/supervisor_auth_client'

test.group('supervisorAuthClient.validateCredentials', (group) => {
  const originalToken = process.env.SUPERVISOR_TOKEN
  const originalFetch = globalThis.fetch

  group.each.teardown(() => {
    if (originalToken === undefined) delete process.env.SUPERVISOR_TOKEN
    else process.env.SUPERVISOR_TOKEN = originalToken
    globalThis.fetch = originalFetch
  })

  test('throws when SUPERVISOR_TOKEN is not set — every non-Supervisor deployment', async ({
    assert,
  }) => {
    delete process.env.SUPERVISOR_TOKEN

    await assert.rejects(
      () => supervisorAuthClient.validateCredentials('alice', 'secret'),
      SupervisorAuthUnavailableError
    )
  })

  test('returns true on a 2xx response and posts the right request shape', async ({ assert }) => {
    process.env.SUPERVISOR_TOKEN = 'test-supervisor-token'
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response(null, { status: 200 })
    }) as typeof fetch

    const valid = await supervisorAuthClient.validateCredentials('alice', 'secret')

    assert.isTrue(valid)
    assert.equal(capturedUrl, 'http://supervisor/auth')
    assert.equal(capturedInit?.method, 'POST')
    const headers = capturedInit?.headers as Record<string, string>
    assert.equal(headers['X-Supervisor-Token'], 'test-supervisor-token')
    assert.deepEqual(JSON.parse(capturedInit?.body as string), {
      username: 'alice',
      password: 'secret',
    })
    // A hung Supervisor shouldn't stall a login request indefinitely — the request must carry an
    // abort signal (a real timeout firing hits the same catch block as "throws when the request
    // itself fails" below, since AbortSignal.timeout() makes fetch reject the same way any other
    // network failure does).
    assert.instanceOf(capturedInit?.signal, AbortSignal)
  })

  test('returns false on a 401 — invalid Home Assistant credentials', async ({ assert }) => {
    process.env.SUPERVISOR_TOKEN = 'test-supervisor-token'
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch

    const valid = await supervisorAuthClient.validateCredentials('alice', 'wrong')

    assert.isFalse(valid)
  })

  test('throws on an unexpected status, distinct from invalid credentials', async ({ assert }) => {
    process.env.SUPERVISOR_TOKEN = 'test-supervisor-token'
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch

    await assert.rejects(
      () => supervisorAuthClient.validateCredentials('alice', 'secret'),
      SupervisorAuthUnavailableError
    )
  })

  test('throws when the request itself fails — Supervisor unreachable', async ({ assert }) => {
    process.env.SUPERVISOR_TOKEN = 'test-supervisor-token'
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as typeof fetch

    await assert.rejects(
      () => supervisorAuthClient.validateCredentials('alice', 'secret'),
      SupervisorAuthUnavailableError
    )
  })
})
