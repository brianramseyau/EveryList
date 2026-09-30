import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run, describeUnexpectedError } from '../src/run.js'
import { helpText } from '../src/help.js'
import { BASE_URL_ENV, TOKEN_ENV } from '../src/config.js'

const created: string[] = []
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-cli-run-'))
  created.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function capture() {
  let stdout = ''
  let stderr = ''
  return {
    output: {
      out: (text: string) => {
        stdout += text
      },
      err: (text: string) => {
        stderr += text
      }
    },
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    }
  }
}

describe('run', () => {
  it('prints the version for --version', async () => {
    const sink = capture()
    const code = await run(['--version'], { output: sink.output })
    expect(code).toBe(0)
    expect(sink.stdout).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('prints the version for the version command', async () => {
    const sink = capture()
    const code = await run(['version'], { output: sink.output })
    expect(code).toBe(0)
    expect(sink.stdout).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('prints help when no command is given', async () => {
    const sink = capture()
    const code = await run([], { output: sink.output })
    expect(code).toBe(0)
    expect(sink.stdout).toContain('Usage: everylist')
  })

  it('prints help for --help', async () => {
    const sink = capture()
    await run(['--help'], { output: sink.output })
    expect(sink.stdout).toContain('Commands:')
  })

  it('prints help for the help command', async () => {
    const sink = capture()
    await run(['help'], { output: sink.output })
    expect(sink.stdout).toContain('Commands:')
  })

  it('returns a usage error for an unknown command', async () => {
    const sink = capture()
    const code = await run(['bogus'], { output: sink.output })
    expect(code).toBe(2)
    expect(sink.stderr).toContain('Unknown command "bogus"')
  })

  it('dispatches to a command and returns 0', async () => {
    const sink = capture()
    const original = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      const data = url.includes('/tokens/me')
        ? { id: 1, name: 'Claude', grants: [], lastUsedAt: null, expiresAt: null, createdAt: 'x' }
        : []
      return { ok: true, status: 200, json: async () => ({ data }) } as Response
    }) as typeof fetch
    try {
      const code = await run(['lists'], {
        output: sink.output,
        env: { [BASE_URL_ENV]: 'https://x.example', [TOKEN_ENV]: 'elt_x' }
      })
      expect(code).toBe(0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('reports a CliError message and its exit code', async () => {
    const dir = tmpDir()
    const sink = capture()
    const code = await run(['lists'], {
      output: sink.output,
      env: { EVERYLIST_CONFIG_DIR: dir } // no URL/token → requireClient throws AuthError (3)
    })
    expect(code).toBe(3)
    expect(sink.stderr).toContain('Not connected to a server')
  })

  it('reports an unexpected throw with exit code 1', async () => {
    const sink = capture()
    const original = globalThis.fetch
    globalThis.fetch = (async () => {
      throw { weird: true }
    }) as unknown as typeof fetch
    try {
      const code = await run(['lists'], {
        output: sink.output,
        env: { [BASE_URL_ENV]: 'https://x.example', [TOKEN_ENV]: 'elt_x' }
      })
      expect(code).toBe(1)
      // The client wraps fetch failures in a CliError, so this path is reached only if the
      // wrapper itself throws — assert the exit code regardless of message shape.
      expect(sink.stderr.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('honors a per-invocation --url/--token override', async () => {
    const sink = capture()
    const original = globalThis.fetch
    let seenUrl = ''
    globalThis.fetch = (async (input: string | URL | Request) => {
      seenUrl = String(input)
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response
    }) as typeof fetch
    try {
      await run(['--url', 'https://flag.example', '--token', 'elt_x', 'lists'], {
        output: sink.output,
        env: {}
      })
      expect(seenUrl).toContain('https://flag.example')
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('describeUnexpectedError', () => {
  it('returns an Error stack when available', () => {
    expect(describeUnexpectedError(new Error('boom'))).toContain('boom')
  })

  it('falls back to the message when there is no stack', () => {
    const error = new Error('no stack')
    error.stack = undefined
    expect(describeUnexpectedError(error)).toBe('no stack')
  })

  it('stringifies a non-Error throw', () => {
    expect(describeUnexpectedError(42)).toBe('42')
  })
})

describe('helpText', () => {
  it('lists every command', () => {
    const text = helpText()
    for (const name of [
      'login',
      'token',
      'lists',
      'list',
      'items',
      'add',
      'complete',
      'uncheck',
      'remove',
      'search'
    ]) {
      expect(text).toContain(name)
    }
  })

  it('describes a single command when given a topic', () => {
    expect(helpText('add')).toContain('everylist add — Add an item')
  })

  it('falls back to full help for an unknown topic', () => {
    expect(helpText('nope')).toContain('Commands:')
  })
})
