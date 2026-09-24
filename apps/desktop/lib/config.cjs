'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** Adjacent to nothing else this project or common dev tooling binds by default — see
 * PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §2. */
const DEFAULT_PORT = 41783

/** Standalone mode's embedded server (PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md) binds a distinct
 * port from the thin-client static server above, so the two modes never collide on
 * localStorage/IndexedDB keyed by origin if a user (unsupported, manually) ends up with both
 * having been used on one machine. */
const STANDALONE_DEFAULT_PORT = 41790

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function validatedPort(value, fallback) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536) {
    return value
  }
  return fallback
}

/**
 * Reads `<userData>/config.json`, the escape hatch for overriding the fixed loopback ports (see
 * §2 — changing either one changes that mode's origin, which resets its local token/server
 * URL/offline cache). Every failure mode (missing file, malformed JSON, an invalid port value)
 * falls back to the defaults rather than throwing — a broken config file must never be why the
 * app won't start.
 *
 * @param {string} userDataDir
 * @returns {{ port: number, standalonePort: number }}
 */
function readConfig(userDataDir) {
  const configPath = path.join(userDataDir, 'config.json')
  const defaults = { port: DEFAULT_PORT, standalonePort: STANDALONE_DEFAULT_PORT }

  let raw
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch {
    return defaults
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults
  }

  if (!parsed || typeof parsed !== 'object') return defaults
  return {
    port: validatedPort(parsed.port, DEFAULT_PORT),
    standalonePort: validatedPort(parsed.standalonePort, STANDALONE_DEFAULT_PORT)
  }
}

module.exports = { readConfig, DEFAULT_PORT, STANDALONE_DEFAULT_PORT }
