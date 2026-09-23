'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')

// Standalone mode's embedded server (PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md) — spawns the same
// AdonisJS + SQLite build Docker runs, staged at apps/desktop/server by
// scripts/copy-api-server.mjs, as a separate child process. Isolates a server crash from the GUI
// process and lets build/bin/server.js run unmodified. The boot sequence (app key, migrations,
// then listen) mirrors what docker/root/etc/cont-init.d/ already does for Docker, re-implemented
// here in JS instead of shell/s6.

/** @param {string} userDataDir */
function getDataDir(userDataDir) {
  return path.join(userDataDir, 'server')
}

/** @param {string} serverAppDir */
function getAppKeyPath(serverAppDir) {
  return path.join(serverAppDir, 'app_key')
}

/** @param {string} dataDir */
function getCredentialsPath(dataDir) {
  return path.join(dataDir, 'owner-credentials.enc')
}

/**
 * Generates a persisted APP_KEY the first time standalone mode boots (mirrors
 * docker/root/etc/cont-init.d/20-app-key), reusing it on every later boot so the loopback
 * server's sessions/tokens don't invalidate on restart.
 *
 * @param {string} appDir - the staged `apps/desktop/server` directory (has build/ace.js)
 * @param {string} dataDir - `userData/server`, where app_key is persisted
 * @returns {string}
 */
function ensureAppKey(appDir, dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  const keyPath = getAppKeyPath(dataDir)

  try {
    return fs.readFileSync(keyPath, 'utf8')
  } catch {
    // Falls through to generation below.
  }

  const result = spawnSync(process.execPath, [path.join(appDir, 'ace.js'), 'generate:key', '--show'], {
    cwd: appDir,
    encoding: 'utf8',
    // process.execPath is the Electron binary itself in a packaged app — without this, spawning
    // it launches a second full GUI Electron app instance instead of running ace.js as a plain
    // Node script. Confirmed the hard way: packaging the app and spawning it without this env var
    // opened an entire second EveryList window (with its own renderer/GPU/network helper
    // processes) rather than printing a generated key. See buildEnv()'s copy of this same fix.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  if (result.status !== 0) {
    throw new Error(`generate:key failed: ${result.stderr || result.stdout}`)
  }
  const match = /^APP_KEY\s*=\s*(\S+)/m.exec(result.stdout)
  const appKey = match?.[1]
  if (!appKey) {
    throw new Error(`generate:key produced no APP_KEY line: ${result.stdout}`)
  }
  fs.writeFileSync(keyPath, appKey, { mode: 0o600 })
  return appKey
}

/**
 * @param {string} appDir
 * @param {NodeJS.ProcessEnv} env
 */
function runMigrations(appDir, env) {
  const result = spawnSync(process.execPath, [path.join(appDir, 'ace.js'), 'migration:run', '--force'], {
    cwd: appDir,
    env,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(
      `migration:run failed with status ${result.status}: ${result.error?.message || result.stderr || result.stdout}`
    )
  }
}

/**
 * @param {object} options
 * @param {string} options.dataDir
 * @param {number} options.port
 * @param {string} options.appKey
 * @returns {NodeJS.ProcessEnv}
 */
function buildEnv({ dataDir, port, appKey }) {
  return {
    ...process.env,
    // Required so runMigrations/startEmbeddedServer's `spawn(process.execPath, ...)` calls run
    // ace.js/bin/server.js as plain Node instead of launching a second Electron app instance — see
    // ensureAppKey's copy of this same comment for how this was actually confirmed.
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    LOG_LEVEL: 'warn',
    APP_KEY: appKey,
    APP_URL: `http://127.0.0.1:${port}`,
    SESSION_DRIVER: 'cookie',
    LIMITER_STORE: 'database',
    DATABASE_FILENAME: path.join(dataDir, 'everylist.sqlite3'),
    // Standalone is single-user by design (PLAN_31 §"Single-user simplifications") — the
    // instance owner is the only account that should ever exist.
    PUBLIC_SIGNUP_ENABLED: 'false'
  }
}

/**
 * Spawns the built server as a detached-from-GUI-crashes child process, having already ensured
 * an app key exists and migrations have run.
 *
 * @param {object} options
 * @param {string} options.appDir - staged apps/desktop/server directory
 * @param {string} options.userDataDir - Electron's app.getPath('userData')
 * @param {number} options.port
 * @param {(chunk: string) => void} [options.onLog]
 * @returns {{ child: import('node:child_process').ChildProcess, dataDir: string }}
 */
function startEmbeddedServer({ appDir, userDataDir, port, onLog = () => {} }) {
  const dataDir = getDataDir(userDataDir)
  const appKey = ensureAppKey(appDir, dataDir)
  const env = buildEnv({ dataDir, port, appKey })

  runMigrations(appDir, env)

  const child = spawn(process.execPath, [path.join(appDir, 'bin', 'server.js')], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => onLog(chunk.toString()))
  child.stderr.on('data', (chunk) => onLog(chunk.toString()))

  return { child, dataDir }
}

/**
 * Polls `GET /api/v1/meta` (the same endpoint Docker's own HEALTHCHECK uses) until it responds
 * or the deadline passes, so the window is never navigated to a connection-refused origin during
 * the brief startup window.
 *
 * Passing `child` closes a narrow but real gap: a bare port-level health check can't tell *our*
 * spawned server apart from anything else that happens to be listening on that port and answering
 * `/api/v1/meta` — if the port is occupied and our child's own bind fails and it exits, blindly
 * continuing to poll could pick up whatever else is there and treat it as ours (main.cjs would
 * then go on to provision an owner and write the standalone mode marker against a server we never
 * actually started). Checking the child's own exit status on every iteration means our child
 * dying is *always* a hard failure here, regardless of what a stray response on the port might
 * otherwise look like.
 *
 * @param {number} port
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.intervalMs]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests, same pattern as
 *   update-check.cjs's checkForUpdate.
 * @param {import('node:child_process').ChildProcess} [options.child] - if given, an exit before
 *   a healthy response is treated as an immediate failure rather than keeping the port polled.
 */
async function waitForHealth(
  port,
  { timeoutMs = 15000, intervalMs = 150, fetchImpl = fetch, child } = {}
) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(
        `Embedded server process exited (code=${child.exitCode}, signal=${child.signalCode}) ` +
          `before becoming healthy — port ${port} may already be in use by something else.`
      )
    }
    // Bounded by whatever's left of the overall deadline: without this, a single request that
    // connects but never responds (a hung process, still alive per the check above) could block
    // past timeoutMs entirely, defeating the point of having one.
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 0))
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/v1/meta`, {
        signal: controller.signal
      })
      if (response.ok) return
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(abortTimer)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs))
  }
  throw new Error(`Embedded server did not become healthy on port ${port}: ${lastError}`)
}

/**
 * Asks the embedded server directly (via the same `GET /api/v1/setup/status` the setup wizard's
 * own first load calls) whether an owner account exists yet — the authoritative source of truth
 * for that, rather than inferring it from whether a local credentials file happens to exist. That
 * inference is wrong in a real case: if a previous provisionOwner call itself failed (network
 * blip, validation error) *after* persistOwnerCredentials already wrote the file, the file exists
 * but no owner was ever created — treating file-existence as "owner exists" would then wrongly
 * refuse every future setup attempt as if a real owner were already there to be locked out of.
 *
 * @param {number} port
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests
 * @returns {Promise<boolean>}
 */
async function needsOwnerSetup(port, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/v1/setup/status`)
  /* v8 ignore next 4 -- same false-negative as provisionOwner's identically-shaped guard above */
  if (response.ok) {
    const parsed = /** @type {{ data: { needsSetup: boolean } }} */ (await response.json())
    return parsed.data.needsSetup
  }
  throw new Error(`Checking setup status failed with status ${response.status}`)
}

/**
 * Generates the placeholder owner identity standalone mode provisions on first boot — never
 * shown anywhere, since standalone mode hides the login/logout UI entirely. Split out from
 * provisionOwner so the caller can persist these credentials (see persistOwnerCredentials)
 * *before* sending them to the server: if persistence fails, the caller can abort without ever
 * having created an account it has no recovery record for (see main.cjs's enableStandaloneOnce).
 *
 * @returns {{ email: string, password: string }}
 */
function generateOwnerCredentials() {
  const password = crypto.randomBytes(24).toString('base64url')
  const email = `owner-${crypto.randomBytes(6).toString('hex')}@standalone.everylist.local`
  return { email, password }
}

/**
 * Auto-provisions the instance owner (PLAN_31's "First-run flow" step 4) by calling the same
 * `POST /api/v1/setup` endpoint the setup wizard's form calls, with the given placeholder
 * identity (see generateOwnerCredentials). Returns the session token so the caller can hand it to
 * the renderer.
 *
 * @param {number} port
 * @param {{ email: string, password: string }} credentials
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests
 * @returns {Promise<string>} the session token
 */
async function provisionOwner(port, { email, password }, { fetchImpl = fetch } = {}) {
  const body = {
    fullName: null,
    email,
    password,
    passwordConfirmation: password,
    backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
  }

  const response = await fetchImpl(`http://127.0.0.1:${port}/api/v1/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  // The "response not ok" test (see embedded-server.spec.cjs) does exercise the false path here
  // and asserts on the thrown error — v8/istanbul just doesn't credit an if-branch whose only
  // alternative is a function-terminating throw with no reconvergence point, the same known
  // false-negative documented on token.ts's getToken().
  /* v8 ignore next 4 */
  if (response.ok) {
    const parsed = /** @type {{ data: { token: string } }} */ (await response.json())
    return parsed.data.token
  }
  throw new Error(`Owner provisioning failed with status ${response.status}`)
}

/**
 * Persists owner credentials (see generateOwnerCredentials) encrypted at rest via Electron's
 * `safeStorage` (injected rather than required directly, so this module stays plain-Node testable
 * — see main.cjs for the real `safeStorage`-backed implementation).
 *
 * Deliberately throws rather than swallowing a failure (e.g. a full disk, or a permissions
 * problem on the data directory): the caller persists these *before* calling provisionOwner
 * specifically so a persistence failure aborts the switch before any account is created on the
 * server, rather than succeeding at creating an owner this module then has no way to recover.
 *
 * @param {string} dataDir
 * @param {{ email: string, password: string }} credentials
 * @param {{ encryptImpl: (plainText: string) => Buffer }} deps
 */
function persistOwnerCredentials(dataDir, credentials, { encryptImpl }) {
  const encrypted = encryptImpl(JSON.stringify(credentials))
  fs.writeFileSync(getCredentialsPath(dataDir), encrypted, { mode: 0o600 })
}

/**
 * Reads back what persistOwnerCredentials wrote, or null on any failure (missing file, corrupt
 * encryption, malformed JSON) — every failure mode is treated the same: no stored credentials to
 * recover with, not an error worth surfacing.
 *
 * @param {string} dataDir
 * @param {{ decryptImpl: (buffer: Buffer) => string }} deps
 * @returns {{ email: string, password: string } | null}
 */
function loadOwnerCredentials(dataDir, { decryptImpl }) {
  let raw
  try {
    raw = fs.readFileSync(getCredentialsPath(dataDir))
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(decryptImpl(raw))
    if (typeof parsed?.email === 'string' && typeof parsed?.password === 'string') {
      return { email: parsed.email, password: parsed.password }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Mints a fresh session token from persisted owner credentials via the normal `POST /api/v1/auth/login`
 * — called on every standalone boot after the first (see main.cjs's bootStandalone), so a token
 * that expired or was cleared client-side doesn't strand the owner with no way to sign back in
 * (standalone mode has no login screen to fall back to).
 *
 * @param {number} port
 * @param {{ email: string, password: string }} credentials
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests
 * @returns {Promise<string>} the session token
 */
async function reauthenticateOwner(port, { email, password }, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  /* v8 ignore next 4 -- same false-negative as provisionOwner's identical shape, see above */
  if (response.ok) {
    const parsed = /** @type {{ data: { token: string } }} */ (await response.json())
    return parsed.data.token
  }
  throw new Error(`Owner re-authentication failed with status ${response.status}`)
}

/**
 * Graceful-then-forceful shutdown for `before-quit`. In practice the SIGKILL fallback is the path
 * that actually ends the process, not a rare backstop: confirmed by actually running the built
 * server and sending it SIGTERM directly — `apps/api`'s scheduler intervals (backup, retention
 * pruner, deadline notifications; see start/*_scheduler.ts) aren't `.unref()`'d, so the event loop
 * never empties on its own even once `app.terminate()` finishes closing the HTTP server and DB
 * connection. Docker masks the same behavior — `docker stop` force-kills after its own timeout
 * regardless of whether the container exited on its own. Not fixed here since it's an existing
 * `apps/api` characteristic outside this feature's scope; SQLite's WAL mode already makes the
 * SIGKILL safe, so a short grace period costs nothing and is kept only in case a future upstream
 * fix ever makes the graceful path actually complete.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} [graceMs]
 * @returns {Promise<void>}
 */
function stopEmbeddedServer(child, graceMs = 1500) {
  return new Promise((resolvePromise) => {
    // The "sends SIGTERM"/"falls back to SIGKILL" tests (see embedded-server.spec.cjs) do exercise
    // this false path with a real, still-running child process — confirmed directly with a debug
    // print during investigation — v8/istanbul just doesn't credit the fallthrough of an if whose
    // only statement is an early return, the same known false-negative documented on
    // provisionOwner's identically-shaped guard above.
    /* v8 ignore next 4 */
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise()
      return
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, graceMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolvePromise()
    })
    child.kill('SIGTERM')
  })
}

module.exports = {
  getDataDir,
  ensureAppKey,
  runMigrations,
  buildEnv,
  startEmbeddedServer,
  waitForHealth,
  needsOwnerSetup,
  generateOwnerCredentials,
  provisionOwner,
  persistOwnerCredentials,
  loadOwnerCredentials,
  reauthenticateOwner,
  stopEmbeddedServer
}
