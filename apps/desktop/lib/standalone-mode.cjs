'use strict'

const fs = require('node:fs')
const path = require('node:path')

// One-time choice made at first launch (PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md's "First-run
// flow") — persisted here so every launch after the first can read it back without re-asking.
// Absent entirely (readMode returns null) until the user actually picks a mode; a null/missing
// marker means "behave exactly as before this feature existed" (boot the thin static-client
// server, same as every desktop install prior to this).

/** @param {string} userDataDir */
function modeFilePath(userDataDir) {
  return path.join(userDataDir, 'mode.json')
}

/**
 * @param {string} userDataDir
 * @returns {'standalone' | 'remote' | null}
 */
function readMode(userDataDir) {
  let raw
  try {
    raw = fs.readFileSync(modeFilePath(userDataDir), 'utf8')
  } catch {
    return null
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const mode = parsed && typeof parsed === 'object' ? parsed.mode : undefined
  return mode === 'standalone' || mode === 'remote' ? mode : null
}

/**
 * @param {string} userDataDir
 * @param {'standalone' | 'remote'} mode
 */
function writeMode(userDataDir, mode) {
  fs.writeFileSync(modeFilePath(userDataDir), JSON.stringify({ mode }))
}

module.exports = { readMode, writeMode }
