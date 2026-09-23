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
    encoding: 'utf8'
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
    env
  })
  if (result.status !== 0) {
    throw new Error(`migration:run failed with status ${result.status}`)
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
 * @param {number} port
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.intervalMs]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests, same pattern as
 *   update-check.cjs's checkForUpdate.
 */
async function waitForHealth(port, { timeoutMs = 15000, intervalMs = 150, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/v1/meta`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs))
  }
  throw new Error(`Embedded server did not become healthy on port ${port}: ${lastError}`)
}

/**
 * Auto-provisions the instance owner (PLAN_31's "First-run flow" step 4) by calling the same
 * `POST /api/v1/setup` endpoint the setup wizard's form calls, with a generated placeholder
 * identity that's never shown anywhere — standalone mode has exactly one user and hides the
 * login/logout UI entirely, so there's nothing for a human-readable email/password to be used
 * for. Returns the session token so the caller can hand it to the renderer.
 *
 * @param {number} port
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests
 * @returns {Promise<string>} the session token
 */
async function provisionOwner(port, { fetchImpl = fetch } = {}) {
  const password = crypto.randomBytes(24).toString('base64url')
  const body = {
    fullName: null,
    email: `owner-${crypto.randomBytes(6).toString('hex')}@standalone.everylist.local`,
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
 * Graceful-then-forceful shutdown for `before-quit` — SQLite's WAL mode already makes a hard kill
 * safe, but this avoids leaving a stray process behind if the child hangs on SIGTERM.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} [graceMs]
 * @returns {Promise<void>}
 */
function stopEmbeddedServer(child, graceMs = 3000) {
  return new Promise((resolvePromise) => {
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
  provisionOwner,
  stopEmbeddedServer
}
