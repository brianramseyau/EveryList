import type { ApiClient } from '../src/client.js'
import type { CommandContext } from '../src/context.js'
import type { FlagValue } from '../src/args.js'
import type { Output } from '../src/output.js'
import type { AccessTokenDto, ItemDto, ListDto } from '@everylist/shared'

/** A recording output sink: collects everything written to stdout/stderr. */
export function recordingOutput(): Output & { stdout: string; stderr: string } {
  const sink = {
    stdout: '',
    stderr: '',
    out(text: string) {
      sink.stdout += text
    },
    err(text: string) {
      sink.stderr += text
    }
  }
  return sink
}

/** A route handler keyed by `METHOD path`. Throwing from one simulates an API failure. */
export type Route = (path: string) => unknown

export interface FakeClientOptions {
  get?: (path: string) => unknown
  post?: (path: string, body: unknown) => unknown
  patch?: (path: string, body: unknown) => unknown
  delete?: (path: string) => unknown
  /** Every (method, path) call, in order, for assertions. */
  calls?: Array<{ method: string; path: string; body?: unknown }>
}

/** Builds a stand-in `ApiClient` whose methods are the supplied functions. */
export function fakeClient(options: FakeClientOptions): ApiClient {
  const calls = options.calls ?? []
  return {
    get: async (path: string) => {
      calls.push({ method: 'GET', path })
      return options.get?.(path)
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return options.post?.(path, body)
    },
    patch: async (path: string, body: unknown) => {
      calls.push({ method: 'PATCH', path, body })
      return options.patch?.(path, body)
    },
    delete: async (path: string) => {
      calls.push({ method: 'DELETE', path })
      return options.delete?.(path)
    }
  } as unknown as ApiClient
}

/** Builds a `CommandContext` for a command under test. */
export function context(overrides: Partial<CommandContext> & { output: Output }): CommandContext {
  return {
    positionals: [],
    flags: {} as Record<string, FlagValue>,
    prompt: async () => '',
    env: {},
    ...overrides
  }
}

export function listFixture(overrides: Partial<ListDto> = {}): ListDto {
  return {
    id: 1,
    name: 'Groceries',
    color: '#fff',
    icon: null,
    ownerId: 1,
    folderId: null,
    archived: false,
    badgeExcluded: false,
    passcodeHash: null,
    itemCount: 0,
    role: 'editor',
    createdAt: '2026-01-01',
    updatedAt: null,
    version: 1,
    ...overrides
  }
}

export function itemFixture(overrides: Partial<ItemDto> = {}): ItemDto {
  return {
    id: 1,
    listId: 1,
    name: 'Milk',
    quantity: null,
    notes: null,
    categoryId: null,
    storeId: null,
    price: null,
    deadline: null,
    checked: false,
    checkedAt: null,
    sortOrder: 1,
    createdBy: 1,
    createdAt: '2026-01-01',
    updatedAt: null,
    deletedAt: null,
    version: 1,
    ...overrides
  }
}

export function tokenFixture(overrides: Partial<AccessTokenDto> = {}): AccessTokenDto {
  return {
    id: 1,
    name: 'Claude',
    grants: [{ listId: 1, role: 'editor' }],
    lastUsedAt: null,
    expiresAt: null,
    createdAt: '2026-01-01',
    ...overrides
  }
}
