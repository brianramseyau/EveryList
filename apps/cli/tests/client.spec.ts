import { describe, expect, it, vi } from 'vitest'
import { ALLOW_INSECURE_ENV, ApiClient, assertSecureBaseUrl } from '../src/client.js'
import { AuthError, CliError } from '../src/errors.js'

/** A minimal `Response`-shaped stub for the fake fetch. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response
}

describe('assertSecureBaseUrl', () => {
  it('accepts https for any host', () => {
    expect(() => assertSecureBaseUrl('https://remote.example', {})).not.toThrow()
  })

  it('accepts http on loopback hosts', () => {
    for (const host of ['http://localhost:3334', 'http://127.0.0.1:3334', 'http://[::1]:3334']) {
      expect(() => assertSecureBaseUrl(host, {})).not.toThrow()
    }
  })

  it('rejects cleartext http to a non-loopback host', () => {
    expect(() => assertSecureBaseUrl('http://remote.example', {})).toThrow(CliError)
    expect(() => assertSecureBaseUrl('http://remote.example', {})).toThrow(
      'Refusing to send your token in cleartext'
    )
  })

  it('allows cleartext http to a remote host with the opt-in env var', () => {
    expect(() =>
      assertSecureBaseUrl('http://remote.example', { [ALLOW_INSECURE_ENV]: '1' })
    ).not.toThrow()
    expect(() =>
      assertSecureBaseUrl('http://remote.example', { [ALLOW_INSECURE_ENV]: 'true' })
    ).not.toThrow()
  })

  it('rejects a non-http(s) scheme', () => {
    expect(() => assertSecureBaseUrl('ftp://x.example', {})).toThrow('Unsupported URL scheme')
  })

  it('rejects a malformed URL', () => {
    expect(() => assertSecureBaseUrl('not a url', {})).toThrow('Invalid server URL')
  })

  it('is enforced by the ApiClient constructor', () => {
    expect(() => new ApiClient('http://remote.example', 'elt_secret')).toThrow(CliError)
  })
})

describe('ApiClient', () => {
  it('sends the bearer token and unwraps the { data } envelope on GET', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: { id: 1, name: 'Groceries' } }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    const result = await client.get<{ id: number; name: string }>('/api/v1/lists/1')

    expect(result).toEqual({ id: 1, name: 'Groceries' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://x.example/api/v1/lists/1')
    expect((init as RequestInit).method).toBe('GET')
    expect((init as RequestInit).headers).toBeInstanceOf(Headers)
    expect(((init as RequestInit).headers as Headers).get('Authorization')).toBe(
      'Bearer elt_secret'
    )
    expect((init as RequestInit).body).toBeUndefined()
  })

  it('serializes a JSON body and sets Content-Type on POST', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { data: { id: 2 } }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    await client.post('/api/v1/lists/1/items', { name: 'Milk' })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ name: 'Milk' }))
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('omits the body and Content-Type on POST with no payload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: {} }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    await client.post('/api/v1/thing')

    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(init.body).toBeUndefined()
    expect((init.headers as Headers).get('Content-Type')).toBeNull()
  })

  it('supports PATCH and DELETE', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: { ok: true } }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    await client.patch('/api/v1/lists/1/items/2', { checked: true })
    await client.delete('/api/v1/lists/1/items/2')

    expect((fetchImpl.mock.calls[0]![1] as RequestInit).method).toBe('PATCH')
    expect((fetchImpl.mock.calls[1]![1] as RequestInit).method).toBe('DELETE')
  })

  it('returns undefined on 204 No Content', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(204, undefined))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    expect(await client.delete('/api/v1/lists/1/items/2')).toBeUndefined()
  })

  it('passes through an unwrapped body unchanged', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [1, 2, 3]))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    expect(await client.get<number[]>('/api/v1/things')).toEqual([1, 2, 3])
  })

  it('throws AuthError (code 3) on 401, naming the server', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    await expect(client.get('/api/v1/lists')).rejects.toBeInstanceOf(AuthError)
    const error = await client.get('/api/v1/lists').catch((e: unknown) => e as AuthError)
    expect(error.exitCode).toBe(3)
    expect(error.message).toContain('token rejected by https://x.example')
  })

  it('throws a plain CliError (code 1) on 403 — a valid token with too low a role', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(403, { message: 'You do not have permission to perform this action' })
    )
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)

    const error = await client.get('/api/v1/lists').catch((e: unknown) => e as CliError)
    expect(error).toBeInstanceOf(CliError)
    expect(error).not.toBeInstanceOf(AuthError)
    expect(error.exitCode).toBe(1)
    expect(error.message).toBe('You do not have permission to perform this action')
  })

  it('extracts an error message from the envelope message field', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { message: 'Item limit reached' }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    await expect(client.get('/api/v1/lists')).rejects.toThrow('Item limit reached')
  })

  it('extracts an error message from the first errors[] entry', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(422, { errors: [{ message: 'name is required' }] })
    )
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    await expect(client.get('/api/v1/lists')).rejects.toThrow('name is required')
  })

  it('falls back to a status-based message when the body has none', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    await expect(client.get('/api/v1/lists')).rejects.toThrow('Request failed with status 500')
  })

  it('falls back to a status-based message when errors[] is empty or malformed', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { errors: [] }))
    const client = new ApiClient('https://x.example', 'elt_secret', fetchImpl)
    await expect(client.get('/api/v1/lists')).rejects.toThrow('Request failed with status 500')
  })

  it('treats a non-JSON error body as no message', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      }
    }))
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      fetchImpl as unknown as typeof fetch
    )
    await expect(client.get('/api/v1/lists')).rejects.toThrow('Request failed with status 502')
  })

  it('reports a network failure as a CliError naming the server', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      fetchImpl as unknown as typeof fetch
    )
    const error = await client.get('/api/v1/lists').catch((e: unknown) => e as CliError)
    expect(error).toBeInstanceOf(CliError)
    expect(error.message).toContain('Could not reach https://x.example')
    expect(error.message).toContain('fetch failed')
  })

  it('stringifies a non-Error throw from fetch', async () => {
    const fetchImpl = vi.fn(async () => {
      throw 'boom'
    })
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      fetchImpl as unknown as typeof fetch
    )
    await expect(client.get('/api/v1/lists')).rejects.toThrow(
      'Could not reach https://x.example: boom'
    )
  })

  it('reports a fetch timeout distinctly', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    })
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      fetchImpl as unknown as typeof fetch,
      1000
    )
    await expect(client.get('/api/v1/lists')).rejects.toThrow(
      'Request to https://x.example timed out after 1000ms'
    )
  })

  it('maps an abort while reading the body to a timeout error', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('The operation was aborted', 'AbortError')
      }
    } as unknown as Response
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      (async () => response) as typeof fetch,
      5
    )
    await expect(client.get('/api/v1/lists')).rejects.toThrow('timed out after 5ms')
  })

  it('treats a non-JSON body mid-read as absent', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      }
    } as unknown as Response
    const client = new ApiClient(
      'https://x.example',
      'elt_secret',
      (async () => response) as typeof fetch
    )
    await expect(client.get('/api/v1/lists')).resolves.toBeUndefined()
  })
})
