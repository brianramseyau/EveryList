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
contextBridge.exposeInMainWorld('everylistDesktop', {
  version,
  platform: process.platform,
  checkForUpdate: () => ipcRenderer.invoke('everylist:check-for-update')
})
