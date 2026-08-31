'use strict'

// Electron main process. Thin wiring only — every decision this file would otherwise make
// (static file resolution, config parsing, window-state clamping, external-link/navigation
// predicates, update-version comparison) lives in lib/ instead, where it's unit-tested. This
// file is excluded from the coverage gate (see vitest.config.ts) on the understanding that the
// moment it grows an `if` of its own, that logic moves to lib/ — see
// PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5 and §9.
//
// The whole boot chain is wrapped so a startup failure always produces a visible error dialog
// (and a log line under userData) instead of the app silently sitting in the dock/taskbar with
// no window and no diagnosable cause — that exact failure mode is what cost the reference
// project (`brianramseyau/ev-charging-log`) a full debugging session (commit `6e112b8`).

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')

const { readConfig } = require('./lib/config.cjs')
const { createStaticServer, listen } = require('./lib/static-server.cjs')
const { readWindowState, writeWindowState, clampWindowState } = require('./lib/window-state.cjs')
const { shouldOpenExternally, isAppOrigin } = require('./lib/navigation.cjs')
const { checkForUpdate } = require('./lib/update-check.cjs')
const packageJson = require('./package.json')

// The renderer is the exact same `apps/web/build` output that serves Docker/PWA/Capacitor — see
// §6 for how it lands at this path once packaged (electron-builder's `files` mapping copies
// apps/web/build to ./renderer next to this file; unpackaged dev expects the same layout via a
// prepackage/copy step). Resolved from __dirname, never process.cwd() — a Finder/Explorer launch
// has a cwd of "/".
const RENDERER_ROOT = path.join(__dirname, 'renderer')

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {number} */
let appPort = 0

/** @param {Error} error */
function logStartupError(error) {
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log')
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${error.stack ?? error}\n`)
  } catch {
    // A packaged GUI launch has no terminal to print to, and if userData itself isn't
    // writable there's nothing more useful to do than let the dialog below carry the error.
  }
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = []

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  })

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const viewSubmenu = [
    { role: 'reload' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]
  if (!app.isPackaged) viewSubmenu.push({ role: 'toggleDevTools' })
  template.push({ label: 'View', submenu: viewSubmenu })

  template.push(/** @type {Electron.MenuItemConstructorOptions} */ ({ role: 'windowMenu' }))

  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'View EveryList releases',
        click: () => shell.openExternal('https://github.com/brianramseyau/EveryList/releases')
      }
    ]
  })

  return Menu.buildFromTemplate(template)
}

async function createWindow() {
  const displays = require('electron').screen.getAllDisplays()
  const persisted = readWindowState(app.getPath('userData'))
  const clamped = clampWindowState(persisted, displays)

  mainWindow = new BrowserWindow({
    width: clamped?.width ?? 1100,
    height: clamped?.height ?? 820,
    x: clamped?.x,
    y: clamped?.y,
    minWidth: 380,
    minHeight: 520,
    // The web layout's content column caps out at 1024px (`app-max-w`'s `lg:max-w-5xl`,
    // layout.css) — anything wider than that just grows the empty background gutters on either
    // side, not the app itself. 1280 leaves a deliberate, modest margin around that column
    // (matching the "generous margins, never full-width" intent layout.css already states)
    // without letting the window balloon to fill an ultrawide/4K display. Height is left
    // uncapped: the content scrolls vertically, so more height is strictly useful, not wasted.
    maxWidth: 1280,
    // macOS's green-button/Cmd+Ctrl+F fullscreen (and the OS's fullscreen window-manager
    // treatment generally) would stretch that same capped-width column across an entire
    // display for the same reason — disabled outright rather than left to look broken.
    fullscreenable: false,
    backgroundColor: '#f6f5f1',
    autoHideMenuBar: process.platform !== 'darwin',
    icon: app.isPackaged ? undefined : path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A sandboxed preload can't `require('./package.json')` — see preload.cjs's comment.
      // This is how it actually receives the version.
      additionalArguments: [`--everylist-version=${packageJson.version}`]
    }
  })

  if (clamped?.isMaximized) mainWindow.maximize()

  if (!app.isPackaged && process.platform === 'darwin') {
    app.dock?.setIcon(path.join(__dirname, 'resources', 'icon.png'))
  }

  // Confirmed the hard way (real launch, 2026-08-31): a preload script that throws or silently
  // no-ops leaves every isDesktop()-gated branch quietly taking the web path instead of failing
  // loudly — exactly PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §1's warning. Surface it instead of
  // letting it disappear into devtools-only console output nobody in a packaged build will see.
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    logStartupError(error)
    dialog.showErrorBox(
      'EveryList — preload script failed',
      `${preloadPath}\n\n${error?.stack ?? error}`
    )
  })

  // Note links and any target="_blank" should open in the system browser, not a chrome-less
  // Electron window — see PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Without this, one stray top-level navigation away from the loopback origin turns the app
  // window into a browser with no address bar and no way back.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppOrigin(url, appPort)) return
    event.preventDefault()
    if (shouldOpenExternally(url)) void shell.openExternal(url)
  })

  const persistState = () => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    writeWindowState(app.getPath('userData'), {
      ...bounds,
      isMaximized: mainWindow.isMaximized()
    })
  }
  mainWindow.on('resize', persistState)
  mainWindow.on('move', persistState)
  mainWindow.on('close', persistState)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  await mainWindow.loadURL(`http://127.0.0.1:${appPort}/`)
}

async function boot() {
  app.setName('EveryList')

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  await app.whenReady()

  const { port } = readConfig(app.getPath('userData'))
  const server = createStaticServer(RENDERER_ROOT)
  try {
    await listen(server, port)
  } catch (error) {
    if (
      error instanceof Error &&
      /** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE'
    ) {
      dialog.showErrorBox(
        'EveryList — port already in use',
        `EveryList couldn't bind to 127.0.0.1:${port} — something else on this machine is ` +
          'already using it.\n\n' +
          `Override the port by creating a config.json file at:\n${path.join(app.getPath('userData'), 'config.json')}\n` +
          'with contents like: { "port": 41784 }\n\n' +
          "Note: changing the port changes the app's origin, which resets the locally " +
          'stored server URL, login token and offline cache (your server-side data is untouched).'
      )
    }
    throw error
  }
  appPort = port

  Menu.setApplicationMenu(buildMenu())

  ipcMain.handle('everylist:check-for-update', () => checkForUpdate(packageJson.version))

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

boot().catch((error) => {
  logStartupError(error)
  dialog.showErrorBox('EveryList failed to start', String(error?.stack ?? error))
  app.exit(1)
})
