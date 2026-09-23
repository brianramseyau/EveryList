'use strict'

// Electron's main-process entry needs CommonJS regardless of this workspace's own
// "type": "module" (kept for parity with the rest of the monorepo) — Node determines module
// type per file by extension, and Electron loads main/preload by path, so `.cjs` here is what
// actually runs as CommonJS. See PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5.

const { contextBridge, ipcRenderer } = require('electron')

// Under `sandbox: true` (main.cjs's BrowserWindow config), a preload script's `require()` is
// restricted to Electron's own built-ins plus a small Node allowlist — `require('./package.json')`
// does NOT work here the way it does in main.cjs, and fails silently rather than crashing
// anything, which is exactly the "compiled but never actually wired" failure
// PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §1 warns about (confirmed the hard way: a real launch
// landed on /login instead of /server-setup because this bridge never got exposed). main.cjs
// passes the version through `additionalArguments` instead, which sandboxed preload can read
// off `process.argv`.
const versionArg = process.argv.find((arg) => arg.startsWith('--everylist-version='))
const version = versionArg ? versionArg.slice('--everylist-version='.length) : 'unknown'

// contextIsolation: true / nodeIntegration: false are Electron's own defaults (since v12/v5) —
// this bridge is what lets the renderer detect the desktop build at all without weakening
// either. apps/web/src/lib/platform/desktop.ts's `isDesktop()` checks for this exact global.
// PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md: `mode` is read fresh via a synchronous IPC call
// rather than baked into `version`'s additionalArguments trick, because it can change mid-session
// — enableStandalone() below does a full loadURL to a new origin, which re-runs this preload
// script, so a sendSync at that point correctly observes the just-written mode instead of the
// stale value the window was originally created with.
const mode = ipcRenderer.sendSync('everylist:get-mode')

contextBridge.exposeInMainWorld('everylistDesktop', {
  version,
  platform: process.platform,
  mode,
  checkForUpdate: () => ipcRenderer.invoke('everylist:check-for-update'),
  // Deadline notifications (PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md): closing the window hides
  // to a tray icon instead of quitting only while this is enabled, so local notification timers
  // (apps/web's $lib/notifications/electron.ts) keep running in the background.
  /** @param {boolean} enabled */
  setBackgroundRun: (enabled) => ipcRenderer.invoke('everylist:set-background-run', enabled),
  // Switches this install into Standalone mode (embedded server, no self-hosted server needed) —
  // a one-time choice offered from /server-setup on first run. Resolves once the renderer has
  // been navigated to the embedded server's own origin; the caller never sees the resolved value
  // in practice since the navigation replaces the calling page.
  enableStandalone: () => ipcRenderer.invoke('everylist:enable-standalone'),
  // Consumes (reads once, then clears) the session token Standalone mode's auto-provisioned setup
  // minted for the owner account — see main.cjs's enableStandalone handler. Synchronous so the
  // renderer's root layout can call it before its own logged-out redirect logic runs on mount.
  consumeStandaloneToken: () => ipcRenderer.sendSync('everylist:consume-standalone-token')
})
