import { AuthError, CliError } from './errors.js'

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
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

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

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: json === undefined ? undefined : JSON.stringify(json)
      })
    } catch (error) {
      // A network/DNS/TLS failure (or the server being down) surfaces as a TypeError from
      // fetch — give it a message that names the configured server so it's actionable.
      const detail = error instanceof Error ? error.message : String(error)
      throw new CliError(`Could not reach ${this.baseUrl}: ${detail}`)
    }

    if (!response.ok) {
      const body = await parseJson(response)
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
    const body = await parseJson(response)
    return unwrap<T>(body)
  }
}

/** True on the API's wrapper `{ data: T }` body — see apps/api's ApiSerializer. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
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
