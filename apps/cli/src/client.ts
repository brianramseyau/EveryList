import { AuthError, CliError } from './errors.js'

/**
 * Env var that opts into sending the token over plain `http://` to a non-loopback host. Off by
 * default: a Personal Access Token is a real credential, and cleartext to a remote server lets
 * anyone on the path capture it. Loopback (`http://localhost`, `http://127.0.0.1`, a self-hosted
 * box on a trusted LAN via an explicit opt-in) is the exception, not the rule.
 */
export const ALLOW_INSECURE_ENV = 'EVERYLIST_ALLOW_INSECURE'

/** True for `localhost`, IPv4/IPv6 loopback, and the unspecified address — the hosts where
 *  cleartext can't leave the machine. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost')
  )
}

/**
 * Rejects a base URL that would send the bearer token in cleartext to a non-loopback host,
 * unless the user explicitly opted in via {@link ALLOW_INSECURE_ENV}. A URL that isn't http(s)
 * at all is also rejected (the client only speaks HTTP).
 */
export function assertSecureBaseUrl(baseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new CliError(`Invalid server URL "${baseUrl}".`)
  }

  if (parsed.protocol === 'https:') return

  if (parsed.protocol !== 'http:') {
    throw new CliError(`Unsupported URL scheme "${parsed.protocol}" — use https (or http).`)
  }

  if (isLoopbackHost(parsed.hostname)) return

  if (env[ALLOW_INSECURE_ENV] === '1' || env[ALLOW_INSECURE_ENV] === 'true') return

  throw new CliError(
    `Refusing to send your token in cleartext to ${baseUrl}. Use https://, or set ` +
      `${ALLOW_INSECURE_ENV}=1 to allow plain http on a trusted network.`
  )
}

/**
 * A minimal REST client for one EveryList server, sending a Personal Access Token as a bearer
 * header. Deliberately `fetch`-based with no framework dependency (PLAN_33: "a small arg parser
 * … until needed") — the API shape is stable and the envelope (`{ data: T }`) is one unwrap.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    /** Injectable for tests; defaults to the global `fetch`. */
    private readonly fetchImpl: typeof fetch = fetch,
    /** Per-request deadline, so a stalled server can't hang a cron/CI invocation forever. */
    private readonly timeoutMs = 30_000,
    /** Env for the cleartext-opt-in check; defaults to the process env. */
    env: NodeJS.ProcessEnv = process.env
  ) {
    assertSecureBaseUrl(baseUrl, env)
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>('POST', path, json)
  }

  patch<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, json)
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private async request<T>(method: string, path: string, json?: unknown): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' })
    if (json !== undefined) headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${this.token}`)

    // A single signal covers the whole exchange, including reading the body below — Node's own
    // Undici timers only detect inactivity, so a server dribbling body chunks could otherwise
    // keep a cron/CI invocation alive forever.
    const signal = AbortSignal.timeout(this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        signal,
        // Never follow a redirect: a 307/308 preserves the method and body, so an HTTPS server
        // could bounce the request (with its item data) to a remote HTTP host the constructor's
        // scheme check never saw. Cross-origin redirects also strip `Authorization`, but that
        // protects the token, not the body.
        redirect: 'manual',
        body: json === undefined ? undefined : JSON.stringify(json)
      })
    } catch (error) {
      // A timeout, DNS/TLS failure, or the server being down all surface here — name the server
      // so the message is actionable, and call out a timeout specifically.
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new CliError(`Request to ${this.baseUrl} timed out after ${this.timeoutMs}ms.`)
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new CliError(`Could not reach ${this.baseUrl}: ${detail}`)
    }

    // With `redirect: manual` these arrive as ordinary 3xx responses (not followed by fetch).
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      throw new CliError(
        `${this.baseUrl} redirected (HTTP ${response.status}` +
          `${location ? ` to ${location}` : ''}) — refusing to follow it with your token/data.`
      )
    }

    if (!response.ok) {
      // An error response may legitimately carry no JSON body (a proxy's HTML 502) — the caller
      // falls back to a status-based message, so a body-read failure here is not fatal.
      const body = await this.readBody(response, signal, false)
      const message = extractErrorMessage(body, response.status)
      // 401 means the token itself is bad/expired (an auth/config problem); a 403 means the
      // token is valid but its grant is too low for this action (a plain runtime failure), so
      // the two map to different exit codes and messages.
      if (response.status === 401) {
        throw new AuthError(`${message} (token rejected by ${this.baseUrl})`)
      }
      throw new CliError(message)
    }

    if (response.status === 204) return undefined as T
    // A 2xx response is expected to carry JSON — a truncated/HTML body is a real failure, not an
    // absent value. Resolving to `undefined` here would let `login` write the config before
    // reading `identity.grants`, persisting a config it then can't use.
    const body = await this.readBody(response, signal, true)
    return unwrap<T>(body)
  }

  /** Reads a response body as JSON. `required` (a success response) turns a non-JSON body into a
   *  `CliError`; otherwise it resolves `undefined` so error handling can fall back to the status.
   *  An abort mid-read maps to a timeout error in both cases — the body read happens after
   *  `fetch` resolved, so a slow body could still exceed the deadline. */
  private async readBody(
    response: Response,
    signal: AbortSignal,
    required: boolean
  ): Promise<unknown> {
    try {
      return await response.json()
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new CliError(`Request to ${this.baseUrl} timed out after ${this.timeoutMs}ms.`)
      }
      if (required) {
        throw new CliError(`${this.baseUrl} returned a malformed response (invalid JSON).`)
      }
      return undefined
    }
  }
}

/** True on the API's wrapper `{ data: T }` body — see apps/api's ApiSerializer. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}

/** Mirrors the web client's `extractErrorMessage` — the API's error envelope is
 *  `{ message }` or `{ errors: [{ message }] }`. */
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { message?: unknown; errors?: unknown }
    if (typeof record.message === 'string') return record.message
    if (Array.isArray(record.errors)) {
      const first = record.errors[0] as { message?: unknown } | undefined
      if (first && typeof first.message === 'string') return first.message
    }
  }
  return `Request failed with status ${status}`
}
