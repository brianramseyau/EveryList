'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * Startup-failure and lifecycle decisions pulled out of main.cjs (PLAN_36). Everything here is
 * pure or takes its file-system effects behind an argument, so the excluded wiring file keeps no
 * branches of its own.
 */

/**
 * Persists a startup failure to `<userData>/startup-error.log` so a packaged GUI launch — which
 * has no terminal to print to — leaves something diagnosable behind. Best-effort: if userData
 * isn't writable there is nothing more useful to do than let the caller's error dialog carry it,
 * so a write failure is swallowed rather than thrown.
 *
 * @param {object} args
 * @param {string} args.userDataDir
 * @param {unknown} args.error
 * @returns {boolean} true if the log was written
 */
function logStartupError({ userDataDir, error }) {
  const stack = error instanceof Error ? (error.stack ?? String(error)) : String(error)
  try {
    fs.writeFileSync(
      path.join(userDataDir, 'startup-error.log'),
      `${new Date().toISOString()}\n${stack}\n`
    )
    return true
  } catch {
    return false
  }
}

/**
 * Whether a thrown listen error is the specific "port already in use" case worth a bespoke,
 * actionable dialog (rather than the generic startup-failure one).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPortInUseError(error) {
  return (
    error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE'
  )
}

/**
 * The message for the port-in-use dialog — explains the conflict, tells the user how to override
 * the port, and warns that changing it changes the origin (resetting local state).
 *
 * @param {{ port: number, userDataDir: string }} args
 * @returns {string}
 */
function portInUseMessage({ port, userDataDir }) {
  return (
    `EveryList couldn't bind to 127.0.0.1:${port} — something else on this machine is ` +
    'already using it.\n\n' +
    `Override the port by creating a config.json file at:\n${path.join(userDataDir, 'config.json')}\n` +
    'with contents like: { "port": 41784 }\n\n' +
    "Note: changing the port changes the app's origin, which resets the locally " +
    'stored server URL, login token and offline cache (your server-side data is untouched).'
  )
}

/**
 * Whether a `second-instance` event should restore+focus an existing window. A hidden/minimized
 * window is restored; a null window means the app is between windows and nothing needs doing.
 *
 * @param {{ hasWindow: boolean, isMinimized: boolean }} args
 * @returns {{ restore: boolean, focus: boolean }}
 */
function secondInstanceAction({ hasWindow, isMinimized }) {
  if (!hasWindow) return { restore: false, focus: false }
  return { restore: isMinimized, focus: true }
}

/**
 * Whether `window-all-closed` should quit the app — everywhere except macOS, where the process
 * conventionally stays alive in the dock until the user quits explicitly.
 *
 * @param {string} platform
 * @returns {boolean}
 */
function shouldQuitOnAllWindowsClosed(platform) {
  return platform !== 'darwin'
}

module.exports = {
  logStartupError,
  isPortInUseError,
  portInUseMessage,
  secondInstanceAction,
  shouldQuitOnAllWindowsClosed
}
