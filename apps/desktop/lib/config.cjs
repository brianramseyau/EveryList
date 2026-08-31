'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** Adjacent to nothing else this project or common dev tooling binds by default — see
 * PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §2. */
const DEFAULT_PORT = 41783

/**
 * Reads `<userData>/config.json`, the escape hatch for overriding the fixed loopback port (see
 * §2 — changing it changes the origin, which resets the local token/server URL/offline cache).
 * Every failure mode (missing file, malformed JSON, an invalid port value) falls back to the
 * default rather than throwing — a broken config file must never be why the app won't start.
 *
 * @param {string} userDataDir
 * @returns {{ port: number }}
 */
function readConfig(userDataDir) {
  const configPath = path.join(userDataDir, 'config.json')

  let raw
  try {
    raw = fs.readFileSync(configPath, 'utf8')
  } catch {
    return { port: DEFAULT_PORT }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { port: DEFAULT_PORT }
  }

  const port = parsed && typeof parsed === 'object' ? parsed.port : undefined
  if (typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536) {
    return { port }
  }
  return { port: DEFAULT_PORT }
}

module.exports = { readConfig, DEFAULT_PORT }
