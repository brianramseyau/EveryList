'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  getDataDir,
  ensureAppKey,
  runMigrations,
  buildEnv,
  startEmbeddedServer,
  waitForHealth,
  provisionOwner,
  stopEmbeddedServer
} = require('./embedded-server.cjs')

/**
 * Writes a minimal `ace.js` fixture that behaves the way the real one does for the two
 * subcommands this module shells out to, driven entirely by env vars so each test can pick
 * exactly what it needs without a real AdonisJS build.
 * @param {string} appDir
 * @param {{ generateKeyOutput?: string, generateKeyExit?: number, migrateExit?: number }} [options]
 */
function writeAceFixture(appDir, { generateKeyOutput = 'APP_KEY = testkey123\n', generateKeyExit = 0, migrateExit = 0 } = {}) {
  fs.writeFileSync(
    path.join(appDir, 'ace.js'),
    `
    const [, , command] = process.argv
    if (command === 'generate:key') {
      process.stdout.write(${JSON.stringify(generateKeyOutput)})
      process.exit(${generateKeyExit})
    } else if (command === 'migration:run') {
      process.exit(${migrateExit})
    }
    `
  )
}

describe('getDataDir', () => {
  it('nests under userData/server', () => {
    expect(getDataDir('/home/user/.config/EveryList')).toBe(
      path.join('/home/user/.config/EveryList', 'server')
    )
  })
})

describe('ensureAppKey', () => {
  /** @type {string} */
  let appDir
  /** @type {string} */
  let dataDir

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-app-'))
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-data-'))
  })

  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  it('generates and persists a key on first boot', () => {
    writeAceFixture(appDir)
    const key = ensureAppKey(appDir, dataDir)
    expect(key).toBe('testkey123')
    expect(fs.readFileSync(path.join(dataDir, 'app_key'), 'utf8')).toBe('testkey123')
  })

  it('reuses a persisted key on a later boot without shelling out again', () => {
    writeAceFixture(appDir)
    const first = ensureAppKey(appDir, dataDir)
    // Break generate:key so a second real invocation would fail — proves the cached path is taken.
    writeAceFixture(appDir, { generateKeyExit: 1 })
    const second = ensureAppKey(appDir, dataDir)
    expect(second).toBe(first)
  })

  it('throws when generate:key exits non-zero', () => {
    writeAceFixture(appDir, { generateKeyExit: 1 })
    expect(() => ensureAppKey(appDir, dataDir)).toThrow(/generate:key failed/)
  })

  it('throws when generate:key produces no APP_KEY line', () => {
    writeAceFixture(appDir, { generateKeyOutput: 'nothing useful\n' })
    expect(() => ensureAppKey(appDir, dataDir)).toThrow(/produced no APP_KEY line/)
  })
})

describe('runMigrations', () => {
  /** @type {string} */
  let appDir

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-app-'))
  })

  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true })
  })

  it('resolves when migration:run succeeds', () => {
    writeAceFixture(appDir)
    expect(() => runMigrations(appDir, process.env)).not.toThrow()
  })

  it('throws when migration:run fails', () => {
    writeAceFixture(appDir, { migrateExit: 1 })
    expect(() => runMigrations(appDir, process.env)).toThrow(/migration:run failed/)
  })
})

describe('buildEnv', () => {
  it('pins the single-user, loopback-only production env', () => {
    const env = buildEnv({ dataDir: '/data', port: 41790, appKey: 'k' })
    expect(env).toMatchObject({
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '41790',
      APP_KEY: 'k',
      APP_URL: 'http://127.0.0.1:41790',
      SESSION_DRIVER: 'cookie',
      LIMITER_STORE: 'database',
      DATABASE_FILENAME: path.join('/data', 'everylist.sqlite3'),
      PUBLIC_SIGNUP_ENABLED: 'false'
    })
  })
})

/** `ChildProcess.stdout`/`stderr` are nullable in general, but never so for a child spawned with
 * `stdio: ['ignore', 'pipe', 'pipe']` (as startEmbeddedServer always does) — narrows for the tests
 * below rather than repeating a non-null assertion at every call site. */
/** @param {import('node:stream').Readable | null} stream */
function pipe(stream) {
  return /** @type {import('node:stream').Readable} */ (stream)
}

describe('startEmbeddedServer', () => {
  /** @type {string} */
  let appDir
  /** @type {string} */
  let userDataDir
  /** @type {import('node:child_process').ChildProcess | null} */
  let child

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-app-'))
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-userdata-'))
    fs.mkdirSync(path.join(appDir, 'bin'))
  })

  afterEach(() => {
    child?.kill('SIGKILL')
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('runs the boot sequence and spawns the server, streaming its output', async () => {
    writeAceFixture(appDir)
    fs.writeFileSync(
      path.join(appDir, 'bin', 'server.js'),
      "process.stdout.write('listening\\n'); setInterval(() => {}, 1000)"
    )

    /** @type {string[]} */
    const logs = []
    const result = startEmbeddedServer({
      appDir,
      userDataDir,
      port: 41790,
      onLog: (chunk) => logs.push(chunk)
    })
    child = result.child
    expect(result.dataDir).toBe(path.join(userDataDir, 'server'))

    await new Promise((resolvePromise) => pipe(result.child.stdout).once('data', resolvePromise))
    expect(logs.join('')).toContain('listening')
  })

  it('propagates a migration failure before ever spawning the server', () => {
    writeAceFixture(appDir, { migrateExit: 1 })
    expect(() => startEmbeddedServer({ appDir, userDataDir, port: 41790 })).toThrow(
      /migration:run failed/
    )
  })

  it('works with no onLog callback at all', async () => {
    writeAceFixture(appDir)
    fs.writeFileSync(
      path.join(appDir, 'bin', 'server.js'),
      "process.stdout.write('listening\\n'); setInterval(() => {}, 1000)"
    )
    const result = startEmbeddedServer({ appDir, userDataDir, port: 41790 })
    child = result.child
    await new Promise((resolvePromise) => pipe(result.child.stdout).once('data', resolvePromise))
  })

  it('streams stderr output through onLog too', async () => {
    writeAceFixture(appDir)
    fs.writeFileSync(
      path.join(appDir, 'bin', 'server.js'),
      "process.stderr.write('oops\\n'); setInterval(() => {}, 1000)"
    )
    /** @type {string[]} */
    const logs = []
    const result = startEmbeddedServer({
      appDir,
      userDataDir,
      port: 41790,
      onLog: (chunk) => logs.push(chunk)
    })
    child = result.child
    await new Promise((resolvePromise) => pipe(result.child.stderr).once('data', resolvePromise))
    expect(logs.join('')).toContain('oops')
  })
})

describe('waitForHealth', () => {
  it('resolves once the health check responds ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true })
    await expect(waitForHealth(41790, { fetchImpl })).resolves.toBeUndefined()
  })

  it('retries past a not-ok response before succeeding', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    await waitForHealth(41790, { fetchImpl, intervalMs: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries past a rejected fetch (connection refused) before succeeding', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce({ ok: true })
    await waitForHealth(41790, { fetchImpl, intervalMs: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws once the timeout passes without a healthy response', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(
      waitForHealth(41790, { fetchImpl, timeoutMs: 10, intervalMs: 1 })
    ).rejects.toThrow(/did not become healthy/)
  })

  it('uses the real global fetch when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (vi.fn().mockResolvedValue({ ok: true }))
    try {
      await expect(waitForHealth(41790)).resolves.toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('provisionOwner', () => {
  it('posts a placeholder identity and returns the minted token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'minted-token' } })
    })
    const token = await provisionOwner(41790, { fetchImpl })
    expect(token).toBe('minted-token')

    const [url, init] = /** @type {[string, RequestInit]} */ (fetchImpl.mock.calls[0])
    expect(url).toBe('http://127.0.0.1:41790/api/v1/setup')
    const body = JSON.parse(/** @type {string} */ (init.body))
    expect(body.fullName).toBeNull()
    expect(body.password).toBe(body.passwordConfirmation)
    expect(body.backup).toEqual({ frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 })
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409 })
    await expect(provisionOwner(41790, { fetchImpl })).rejects.toThrow(/status 409/)
  })

  it('uses the real global fetch when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { token: 'x' } }) })
    )
    try {
      await expect(provisionOwner(41790)).resolves.toBe('x')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('stopEmbeddedServer', () => {
  it('resolves immediately when the child has already exited', async () => {
    const child = /** @type {any} */ ({ exitCode: 0, signalCode: null })
    await expect(stopEmbeddedServer(child)).resolves.toBeUndefined()
  })

  it('sends SIGTERM and resolves once the process exits', async () => {
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    await stopEmbeddedServer(child, 3000)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  it('falls back to SIGKILL when the child ignores SIGTERM', async () => {
    const child = require('node:child_process').spawn(process.execPath, [
      '-e',
      "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000)"
    ])
    // Only send SIGTERM once the handler above is actually installed — otherwise it can arrive
    // before `process.on` runs and terminate the process via the default handler instead,
    // making this test flaky rather than exercising the SIGKILL fallback it's meant to check.
    await new Promise((resolvePromise) => child.stdout.once('data', resolvePromise))
    await stopEmbeddedServer(child, 20)
    expect(child.signalCode).toBe('SIGKILL')
  })
})
