'use strict'

const { shouldHideInsteadOfClose } = require('./tray.cjs')

/**
 * Window sizing and close-behavior decisions, pulled out of main.cjs so the excluded wiring
 * file makes no choices of its own (PLAN_36_PHASE_NATIVE_TEST_COVERAGE.md / PLAN_22 §9).
 */

/** Fallbacks when no usable persisted state exists. */
const DEFAULT_WINDOW_WIDTH = 1100
const DEFAULT_WINDOW_HEIGHT = 820

/**
 * The web layout's content column caps out at 1024px (`app-max-w`'s `lg:max-w-5xl`, layout.css) —
 * anything wider than that just grows the empty background gutters on either side, not the app
 * itself. 1280 leaves a deliberate, modest margin around that column (matching the "generous
 * margins, never full-width" intent layout.css already states) without letting the window
 * balloon to fill an ultrawide/4K display. Height is left uncapped: the content scrolls
 * vertically, so more height is strictly useful, not wasted.
 */
const MAX_WINDOW_WIDTH = 1280

/**
 * @typedef {{ x?: number, y?: number, width: number, height: number, isMaximized?: boolean }} ClampedWindowState
 */

/**
 * Whether a persisted, already-clamped state asked for the window to reopen maximized.
 *
 * @param {ClampedWindowState | null} clamped
 * @returns {boolean}
 */
function shouldMaximize(clamped) {
  return Boolean(clamped && clamped.isMaximized)
}

/**
 * Builds the `BrowserWindow` constructor options. `clamped` is the result of
 * {@link import('./window-state.cjs').clampWindowState} (or null when there's nothing usable to
 * restore). Kept pure so every fallback is unit-tested rather than living in excluded wiring.
 *
 * @param {object} args
 * @param {ClampedWindowState | null} args.clamped
 * @param {boolean} args.isPackaged
 * @param {string} args.platform
 * @param {string} args.iconPath
 * @param {string} args.preloadPath
 * @param {string} args.version
 * @returns {Record<string, unknown>}
 */
function buildWindowOptions({ clamped, isPackaged, platform, iconPath, preloadPath, version }) {
  return {
    width: clamped && clamped.width != null ? clamped.width : DEFAULT_WINDOW_WIDTH,
    height: clamped && clamped.height != null ? clamped.height : DEFAULT_WINDOW_HEIGHT,
    x: clamped ? clamped.x : undefined,
    y: clamped ? clamped.y : undefined,
    minWidth: 380,
    minHeight: 520,
    maxWidth: MAX_WINDOW_WIDTH,
    // macOS's green-button/Cmd+Ctrl+F fullscreen (and the OS's fullscreen window-manager
    // treatment generally) would stretch that same capped-width column across an entire display
    // for the same reason — disabled outright rather than left to look broken.
    fullscreenable: false,
    backgroundColor: '#f6f5f1',
    autoHideMenuBar: platform !== 'darwin',
    icon: isPackaged ? undefined : iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A sandboxed preload can't `require('./package.json')` — this is how it actually receives
      // the version. See preload.cjs.
      additionalArguments: [`--everylist-version=${version}`]
    }
  }
}

/**
 * Whether a window `close` event should be cancelled and the window hidden to the tray instead.
 * Background-run is opt-in and tied to the deadline-notifications toggle; a quit already in
 * progress always wins.
 *
 * @param {{ isQuitting: boolean, backgroundRunEnabled: boolean }} args
 * @returns {boolean}
 */
function shouldHideOnClose({ isQuitting, backgroundRunEnabled }) {
  return !isQuitting && shouldHideInsteadOfClose(backgroundRunEnabled)
}

/**
 * Whether to set a custom dock icon. Only in an unpackaged macOS dev run — a packaged app gets
 * its icon from the bundle, and Windows/Linux have no dock.
 *
 * @param {{ isPackaged: boolean, platform: string }} args
 * @returns {boolean}
 */
function shouldSetDockIcon({ isPackaged, platform }) {
  return !isPackaged && platform === 'darwin'
}

module.exports = {
  buildWindowOptions,
  shouldMaximize,
  shouldHideOnClose,
  shouldSetDockIcon,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MAX_WINDOW_WIDTH
}
