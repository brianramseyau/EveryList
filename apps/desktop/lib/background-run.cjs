'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * Persists whether closing the window should hide it to the tray instead of quitting — set from
 * the renderer via IPC whenever the deadline notifications Settings toggle changes (see
 * PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md). A separate file from `config.json` (the user-edited
 * port override) since this one is only ever written by the app itself — same split as
 * `window-state.json`.
 *
 * @param {string} userDataDir
 * @returns {boolean}
 */
function readBackgroundRunEnabled(userDataDir) {
  let raw
  try {
    raw = fs.readFileSync(path.join(userDataDir, 'background-run.json'), 'utf8')
  } catch {
    return false
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  return Boolean(parsed && typeof parsed === 'object' && parsed.enabled === true)
}

/**
 * @param {string} userDataDir
 * @param {boolean} enabled
 */
function writeBackgroundRunEnabled(userDataDir, enabled) {
  fs.writeFileSync(path.join(userDataDir, 'background-run.json'), JSON.stringify({ enabled }))
}

module.exports = { readBackgroundRunEnabled, writeBackgroundRunEnabled }
