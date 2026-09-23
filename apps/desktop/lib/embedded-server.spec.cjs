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
  generateOwnerCredentials,
  provisionOwner,
  persistOwnerCredentials,
  loadOwnerCredentials,
  reauthenticateOwner,
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

  it('does not throw when a live child never exits during a successful wait', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true })
    const child = /** @type {any} */ ({ exitCode: null })
    await expect(waitForHealth(41790, { fetchImpl, child })).resolves.toBeUndefined()
  })

  it('throws immediately if the child has already exited, even if the port answers', async () => {
    // Simulates the port-collision case this guards against: something else on the port answers
    // ok, but our own spawned server already died (e.g. its bind failed) — see the doc comment on
    // waitForHealth for why this can't be trusted just because *a* response came back.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true })
    const child = /** @type {any} */ ({ exitCode: 1 })
    await expect(waitForHealth(41790, { fetchImpl, child, intervalMs: 1 })).rejects.toThrow(
      /exited \(code=1\) before becoming healthy/
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws once the child exits partway through polling', async () => {
    const child = /** @type {any} */ ({ exitCode: null })
    const fetchImpl = vi.fn().mockImplementation(async () => {
      child.exitCode = 1
      return { ok: false }
    })
    await expect(waitForHealth(41790, { fetchImpl, child, intervalMs: 1 })).rejects.toThrow(
      /exited \(code=1\) before becoming healthy/
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
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

describe('generateOwnerCredentials', () => {
  it('generates a placeholder email and a random password', () => {
    const a = generateOwnerCredentials()
    const b = generateOwnerCredentials()
    expect(a.email).toMatch(/^owner-[0-9a-f]{12}@standalone\.everylist\.local$/)
    expect(a.password).toEqual(expect.any(String))
    // Distinct across calls — proves it's not a fixed placeholder.
    expect(a.email).not.toBe(b.email)
    expect(a.password).not.toBe(b.password)
  })
})

describe('provisionOwner', () => {
  const credentials = { email: 'owner-abc@standalone.everylist.local', password: 'sekret-pw' }

  it('posts the given identity and returns the minted token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'minted-token' } })
    })
    const token = await provisionOwner(41790, credentials, { fetchImpl })
    expect(token).toBe('minted-token')

    const [url, init] = /** @type {[string, RequestInit]} */ (fetchImpl.mock.calls[0])
    expect(url).toBe('http://127.0.0.1:41790/api/v1/setup')
    const body = JSON.parse(/** @type {string} */ (init.body))
    expect(body.fullName).toBeNull()
    expect(body.email).toBe(credentials.email)
    expect(body.password).toBe(credentials.password)
    expect(body.password).toBe(body.passwordConfirmation)
    expect(body.backup).toEqual({ frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 })
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409 })
    await expect(provisionOwner(41790, credentials, { fetchImpl })).rejects.toThrow(/status 409/)
  })

  it('uses the real global fetch when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { token: 'x' } }) })
    )
    try {
      await expect(provisionOwner(41790, credentials)).resolves.toBe('x')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

/** A stand-in for Electron's `safeStorage` (unavailable outside a real Electron process) — plain
 * base64, sufficient to exercise persistOwnerCredentials/loadOwnerCredentials's own logic (file
 * I/O, JSON round-tripping, failure handling) independent of real encryption. */
/** @param {string} plainText */
function fakeEncrypt(plainText) {
  return Buffer.from(plainText, 'utf8')
}
/** @param {Buffer} buffer */
function fakeDecrypt(buffer) {
  return buffer.toString('utf8')
}

describe('persistOwnerCredentials / loadOwnerCredentials', () => {
  /** @type {string} */
  let dataDir

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-embedded-creds-'))
  })

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  it('is null when no credentials file exists', () => {
    expect(loadOwnerCredentials(dataDir, { decryptImpl: fakeDecrypt })).toBeNull()
  })

  it('round-trips credentials through encrypt/decrypt', () => {
    const credentials = { email: 'owner@standalone.everylist.local', password: 'sekret' }
    persistOwnerCredentials(dataDir, credentials, { encryptImpl: fakeEncrypt })
    expect(loadOwnerCredentials(dataDir, { decryptImpl: fakeDecrypt })).toEqual(credentials)
  })

  it('propagates an encryption failure rather than silently leaving nothing persisted', () => {
    // Deliberate: the caller persists before calling provisionOwner specifically so a failure
    // here aborts the whole switch before any account is created on the server — see
    // persistOwnerCredentials's own doc comment.
    const encryptImpl = () => {
      throw new Error('safeStorage unavailable')
    }
    expect(() =>
      persistOwnerCredentials(dataDir, { email: 'a', password: 'b' }, { encryptImpl })
    ).toThrow(/safeStorage unavailable/)
    expect(loadOwnerCredentials(dataDir, { decryptImpl: fakeDecrypt })).toBeNull()
  })

  it('propagates a filesystem write failure', () => {
    const missingDataDir = path.join(dataDir, 'does', 'not', 'exist')
    expect(() =>
      persistOwnerCredentials(missingDataDir, { email: 'a', password: 'b' }, { encryptImpl: fakeEncrypt })
    ).toThrow()
  })

  it('is null when decryption throws', () => {
    persistOwnerCredentials(dataDir, { email: 'a', password: 'b' }, { encryptImpl: fakeEncrypt })
    const decryptImpl = () => {
      throw new Error('bad key')
    }
    expect(loadOwnerCredentials(dataDir, { decryptImpl })).toBeNull()
  })

  it('is null when the decrypted content is not valid JSON', () => {
    fs.writeFileSync(path.join(dataDir, 'owner-credentials.enc'), fakeEncrypt('not json'))
    expect(loadOwnerCredentials(dataDir, { decryptImpl: fakeDecrypt })).toBeNull()
  })

  it.each([
    ['missing password', '{"email": "a"}'],
    ['missing email', '{"password": "b"}'],
    ['root is a number', '42'],
    ['root is null', 'null']
  ])('is null when the decrypted shape is invalid: %s', (_label, plaintext) => {
    fs.writeFileSync(path.join(dataDir, 'owner-credentials.enc'), fakeEncrypt(plaintext))
    expect(loadOwnerCredentials(dataDir, { decryptImpl: fakeDecrypt })).toBeNull()
  })
})

describe('reauthenticateOwner', () => {
  it('posts the stored credentials and returns a fresh token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'fresh-token' } })
    })
    const credentials = { email: 'owner@standalone.everylist.local', password: 'sekret' }
    const token = await reauthenticateOwner(41790, credentials, { fetchImpl })
    expect(token).toBe('fresh-token')

    const [url, init] = /** @type {[string, RequestInit]} */ (fetchImpl.mock.calls[0])
    expect(url).toBe('http://127.0.0.1:41790/api/v1/login')
    expect(JSON.parse(/** @type {string} */ (init.body))).toEqual(credentials)
  })

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(
      reauthenticateOwner(41790, { email: 'a', password: 'b' }, { fetchImpl })
    ).rejects.toThrow(/status 401/)
  })

  it('uses the real global fetch when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { token: 'x' } }) })
    )
    try {
      await expect(reauthenticateOwner(41790, { email: 'a', password: 'b' })).resolves.toBe('x')
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
