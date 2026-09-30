import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loginCommand, tokenCommand } from '../src/commands/login.js'
import { readConfig } from '../src/config.js'
import { UsageError } from '../src/errors.js'
import { context, fakeClient, recordingOutput, tokenFixture } from './helpers.js'

const created: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-cli-login-'))
  created.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/** A client that answers /tokens/me — login builds its own ApiClient, so tests inject via a
 *  fetch stub on globalThis. */
function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response
}

describe('loginCommand', () => {
  it('verifies the token and writes the config (0600)', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    const restore = stubFetch(() => jsonResponse(200, { data: tokenFixture() }))
    try {
      await loginCommand(
        context({
          output,
          flags: { url: 'https://x.example/', token: 'elt_abcdefghijklmnop' },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    } finally {
      restore()
    }

    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir })).toEqual({
      baseUrl: 'https://x.example',
      token: 'elt_abcdefghijklmnop'
    })
    expect(output.stdout).toContain('Connected to https://x.example')
    // The full token is never printed, only its mask.
    expect(output.stdout).not.toContain('elt_abcdefghijklmnop')
    expect(output.stdout).toContain('elt_abc…mnop')
  })

  it('prints JSON when --json is set', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    const restore = stubFetch(() => jsonResponse(200, { data: tokenFixture() }))
    try {
      await loginCommand(
        context({
          output,
          flags: { url: 'https://x.example', token: 'elt_abcdefghijklmnop', json: true },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    } finally {
      restore()
    }
    const parsed = JSON.parse(output.stdout) as { baseUrl: string; token: string }
    expect(parsed.baseUrl).toBe('https://x.example')
    expect(parsed.token).toBe('elt_abc…mnop')
  })

  it('prompts for a token when none is supplied', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    const restore = stubFetch(() => jsonResponse(200, { data: tokenFixture() }))
    try {
      await loginCommand(
        context({
          output,
          flags: { url: 'https://x.example' },
          env: { EVERYLIST_CONFIG_DIR: dir },
          prompt: async () => '  elt_prompted_token  '
        })
      )
    } finally {
      restore()
    }
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir }).token).toBe('elt_prompted_token')
  })

  it('handles an unnamed token with a single grant', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    const restore = stubFetch(() =>
      jsonResponse(200, {
        data: tokenFixture({ name: null, grants: [{ listId: 7, role: 'editor' }] })
      })
    )
    try {
      await loginCommand(
        context({
          output,
          flags: { url: 'https://x.example', token: 'elt_abcdefghijklmnop' },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    } finally {
      restore()
    }
    expect(output.stdout).toContain('Token: (unnamed)')
    expect(output.stdout).toContain('Reachable lists: 1 list')
  })

  it('reports zero reachable lists without a trailing list of ids', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    const restore = stubFetch(() => jsonResponse(200, { data: tokenFixture({ grants: [] }) }))
    try {
      await loginCommand(
        context({
          output,
          flags: { url: 'https://x.example', token: 'elt_abcdefghijklmnop' },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    } finally {
      restore()
    }
    expect(output.stdout).toContain('Reachable lists: 0 lists')
  })

  it('uses the config URL when --url is omitted', async () => {
    const dir = tmpDir()
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ baseUrl: 'https://config.example' })
    )
    const output = recordingOutput()
    const restore = stubFetch(() => jsonResponse(200, { data: tokenFixture() }))
    try {
      await loginCommand(
        context({
          output,
          flags: { token: 'elt_abcdefghijklmnop' },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    } finally {
      restore()
    }
    expect(output.stdout).toContain('https://config.example')
  })

  it('uses EVERYLIST_URL when --url and the config are both absent', async () => {
    const dir = tmpDir()
    const output = recordingOutput()
    let seenUrl = ''
    const original = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
      seenUrl = String(input)
      return jsonResponse(200, { data: tokenFixture() })
    }) as typeof fetch
    try {
      await loginCommand(
        context({
          output,
          flags: { token: 'elt_abcdefghijklmnop' },
          env: { EVERYLIST_CONFIG_DIR: dir, EVERYLIST_URL: 'https://env.example/' }
        })
      )
    } finally {
      globalThis.fetch = original
    }
    // The saved/used URL is normalized (no double slash) and comes from the env var.
    expect(seenUrl).toBe('https://env.example/api/v1/tokens/me')
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir }).baseUrl).toBe('https://env.example')
  })

  it('throws a usage error when no URL is available', async () => {
    const dir = tmpDir()
    await expect(
      loginCommand(
        context({
          output: recordingOutput(),
          flags: { token: 'elt_x' },
          env: { EVERYLIST_CONFIG_DIR: dir }
        })
      )
    ).rejects.toBeInstanceOf(UsageError)
  })

  it('throws a usage error when the prompt returns nothing', async () => {
    const dir = tmpDir()
    await expect(
      loginCommand(
        context({
          output: recordingOutput(),
          flags: { url: 'https://x.example' },
          env: { EVERYLIST_CONFIG_DIR: dir },
          prompt: async () => ''
        })
      )
    ).rejects.toThrow('No token provided')
  })

  it('rejects an unknown flag', async () => {
    await expect(
      loginCommand(
        context({
          output: recordingOutput(),
          flags: { url: 'https://x.example', bogus: true },
          env: {}
        })
      )
    ).rejects.toBeInstanceOf(UsageError)
  })
})

describe('tokenCommand', () => {
  it('prints the server, token name, and grants', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: () => tokenFixture({ grants: [{ listId: 3, role: 'viewer' }] })
    })
    await tokenCommand(
      context({
        client,
        output,
        baseUrl: 'https://x.example',
        token: 'elt_abcdefghijklmnop'
      })
    )
    expect(output.stdout).toContain('Server: https://x.example')
    expect(output.stdout).toContain('list 3 (viewer)')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    const client = fakeClient({ get: () => tokenFixture() })
    await tokenCommand(
      context({
        client,
        output,
        flags: { json: true },
        baseUrl: 'https://x.example',
        token: 'elt_abcdefghijklmnop'
      })
    )
    expect(JSON.parse(output.stdout).baseUrl).toBe('https://x.example')
  })

  it('reports "none" when the token has no grants', async () => {
    const output = recordingOutput()
    const client = fakeClient({ get: () => tokenFixture({ grants: [] }) })
    await tokenCommand(context({ client, output, baseUrl: 'https://x.example' }))
    expect(output.stdout).toContain('Grants: none')
  })

  it('omits the mask when no token is resolvable', async () => {
    const output = recordingOutput()
    const client = fakeClient({ get: () => tokenFixture({ name: null }) })
    await tokenCommand(context({ client, output, baseUrl: 'https://x.example' }))
    expect(output.stdout).toContain('Token:  (unnamed)\n')
  })

  it('prints JSON with a null token when none is resolvable', async () => {
    const output = recordingOutput()
    const client = fakeClient({ get: () => tokenFixture() })
    await tokenCommand(
      context({ client, output, flags: { json: true }, baseUrl: 'https://x.example' })
    )
    expect(JSON.parse(output.stdout).token).toBeNull()
  })

  it('requires a client', async () => {
    await expect(
      tokenCommand(context({ output: recordingOutput(), baseUrl: 'https://x.example' }))
    ).rejects.toThrow('Not connected to a server')
  })
})
