'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * @typedef {{ x?: number, y?: number, width: number, height: number, isMaximized: boolean }} WindowState
 * @typedef {{ bounds: { x: number, y: number, width: number, height: number } }} Display
 */

/**
 * Reads `<userData>/window-state.json`. Missing file, malformed JSON, or a value missing
 * usable dimensions all resolve to `null` (caller falls back to the default window size) rather
 * than throwing.
 *
 * @param {string} userDataDir
 * @returns {WindowState | null}
 */
function readWindowState(userDataDir) {
  let raw
  try {
    raw = fs.readFileSync(path.join(userDataDir, 'window-state.json'), 'utf8')
  } catch {
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.width !== 'number' ||
    typeof parsed.height !== 'number'
  ) {
    return null
  }
  return parsed
}

/**
 * @param {string} userDataDir
 * @param {WindowState} state
 */
function writeWindowState(userDataDir, state) {
  fs.writeFileSync(path.join(userDataDir, 'window-state.json'), JSON.stringify(state))
}

/**
 * Restoring a persisted window position blind is a known footgun when the monitor it was saved
 * on has since been unplugged (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5) — clamp to a display that
 * is actually present before trusting `x`/`y`, and always cap dimensions to something sane.
 *
 * @param {WindowState | null} state
 * @param {Display[]} displays
 * @returns {WindowState | null}
 */
function clampWindowState(state, displays) {
  if (!state || state.width <= 0 || state.height <= 0) return null

  const width = Math.min(state.width, 10000)
  const height = Math.min(state.height, 10000)
  const isMaximized = Boolean(state.isMaximized)

  if (typeof state.x !== 'number' || typeof state.y !== 'number') {
    return { width, height, isMaximized }
  }

  const { x, y } = state
  const onKnownDisplay = displays.some((display) => {
    const b = display.bounds
    return x + width > b.x && x < b.x + b.width && y + height > b.y && y < b.y + b.height
  })
  if (!onKnownDisplay) {
    return { width, height, isMaximized }
  }

  return { x, y, width, height, isMaximized }
}

module.exports = { readWindowState, writeWindowState, clampWindowState }
