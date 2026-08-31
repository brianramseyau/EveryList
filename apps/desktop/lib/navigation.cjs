'use strict'

/**
 * Whether a URL should be handed to the system browser rather than opened inside Electron —
 * used by both `setWindowOpenHandler` (note links / `target="_blank"`) and the `will-navigate`
 * guard (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5). Only `http:`/`https:` are allowed through to
 * `shell.openExternal`; anything else (`file:`, `javascript:`, a malformed string) is denied.
 *
 * @param {string} url
 * @returns {boolean}
 */
function shouldOpenExternally(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/**
 * Whether `url` is still within the app's own loopback origin — used by the `will-navigate`
 * guard to tell an in-app SPA navigation from a stray top-level navigation away from the app.
 *
 * @param {string} url
 * @param {number} port
 * @returns {boolean}
 */
function isAppOrigin(url, port) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  return parsed.protocol === 'http:' && isLoopback && Number(parsed.port) === port
}

module.exports = { shouldOpenExternally, isAppOrigin }
