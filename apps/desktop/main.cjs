'use strict'

// Electron main process. Thin wiring only — every decision this file would otherwise make
// (static file resolution, config parsing, window-state clamping, window sizing/close behavior,
// the application menu, the tray create/destroy choice, external-link/navigation predicates,
// update-version comparison, startup-error handling) lives in lib/ instead, where it's
// unit-tested. What stays here is Electron event dispatch and null guards. This file is outside
// the coverage gate (see vitest.config.ts) on the understanding that the moment it grows another
// real decision, that logic moves to lib/ — see PLAN_36_PHASE_NATIVE_TEST_COVERAGE.md and
// PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §5 and §9.
//
// The whole boot chain is wrapped so a startup failure always produces a visible error dialog
// (and a log line under userData) instead of the app silently sitting in the dock/taskbar with
// no window and no diagnosable cause — that exact failure mode is what cost the reference
// project (`brianramseyau/ev-charging-log`) a full debugging session (commit `6e112b8`).

const path = require('node:path')
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell } = require('electron')

const { readConfig } = require('./lib/config.cjs')
const { createStaticServer, listen } = require('./lib/static-server.cjs')
const { readWindowState, writeWindowState, clampWindowState } = require('./lib/window-state.cjs')
const { shouldOpenExternally, isAppOrigin } = require('./lib/navigation.cjs')
const { checkForUpdate } = require('./lib/update-check.cjs')
const { readBackgroundRunEnabled, writeBackgroundRunEnabled } = require('./lib/background-run.cjs')
const { buildTrayMenuTemplate, trayAction } = require('./lib/tray.cjs')
const {
  buildWindowOptions,
  shouldMaximize,
  shouldHideOnClose,
  shouldSetDockIcon
} = require('./lib/window-options.cjs')
const { buildMenuTemplate } = require('./lib/menu.cjs')
const {
  logStartupError,
  isPortInUseError,
  portInUseMessage,
  secondInstanceAction,
  shouldQuitOnAllWindowsClosed
} = require('./lib/startup.cjs')
const packageJson = require('./package.json')

// The renderer is the exact same `apps/web/build` output that serves Docker/PWA/Capacitor — see
// §6 for how it lands at this path once packaged (electron-builder's `files` mapping copies
// apps/web/build to ./renderer next to this file; unpackaged dev expects the same layout via a
// prepackage/copy step). Resolved from __dirname, never process.cwd() — a Finder/Explorer launch
// has a cwd of "/".
const RENDERER_ROOT = path.join(__dirname, 'renderer')
const ICON_PATH = path.join(__dirname, 'resources', 'icon.png')
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs')

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {number} */
let appPort = 0
/** @type {Tray | null} */
let tray = null
let backgroundRunEnabled = false
let isQuitting = false

/** @param {Error} error */
function persistStartupError(error) {
  logStartupError({ userDataDir: app.getPath('userData'), error })
}

/** Creates or destroys the tray icon to match `backgroundRunEnabled` — see
 * PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md §"Electron". Idempotent; the decision itself is the
 * tested `trayAction`. */
function syncTray() {
  const action = trayAction({ backgroundRunEnabled, hasTray: tray !== null })
  if (action === 'create') {
    const created = new Tray(ICON_PATH)
    tray = created
    created.setToolTip('EveryList')
    created.setContextMenu(
      Menu.buildFromTemplate(
        buildTrayMenuTemplate({
          onShow: () => {
            mainWindow?.show()
            mainWindow?.focus()
          },
          onQuit: () => {
            isQuitting = true
            app.quit()
          }
        })
      )
    )
    created.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } else if (action === 'destroy') {
    tray?.destroy()
    tray = null
  }
}

async function createWindow() {
  const displays = require('electron').screen.getAllDisplays()
  const clamped = clampWindowState(readWindowState(app.getPath('userData')), displays)

  mainWindow = new BrowserWindow(
    buildWindowOptions({
      clamped,
      isPackaged: app.isPackaged,
      platform: process.platform,
      iconPath: ICON_PATH,
      preloadPath: PRELOAD_PATH,
      version: packageJson.version
    })
  )

  if (shouldMaximize(clamped)) mainWindow.maximize()

  if (shouldSetDockIcon({ isPackaged: app.isPackaged, platform: process.platform })) {
    app.dock?.setIcon(ICON_PATH)
  }

  // Confirmed the hard way (real launch, 2026-08-31): a preload script that throws or silently
  // no-ops leaves every isDesktop()-gated branch quietly taking the web path instead of failing
  // loudly — exactly PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §1's warning. Surface it instead of
  // letting it disappear into devtools-only console output nobody in a packaged build will see.
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    persistStartupError(error)
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
  mainWindow.on('close', (event) => {
    persistState()
    if (shouldHideOnClose({ isQuitting, backgroundRunEnabled })) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  await mainWindow.loadURL(`http://127.0.0.1:${appPort}/`)
}

/**
 * @param {import('node:http').Server} server
 * @param {number} port
 */
async function listenOrReportPortConflict(server, port) {
  try {
    await listen(server, port)
  } catch (error) {
    if (isPortInUseError(error)) {
      dialog.showErrorBox(
        'EveryList — port already in use',
        portInUseMessage({ port, userDataDir: app.getPath('userData') })
      )
    }
    throw error
  }
}

async function boot() {
  app.setName('EveryList')

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    const { restore, focus } = secondInstanceAction({
      hasWindow: mainWindow !== null,
      isMinimized: mainWindow ? mainWindow.isMinimized() : false
    })
    if (restore) mainWindow?.restore()
    if (focus) mainWindow?.focus()
  })

  await app.whenReady()

  const { port } = readConfig(app.getPath('userData'))
  await listenOrReportPortConflict(createStaticServer(RENDERER_ROOT), port)
  appPort = port

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate({
        platform: process.platform,
        isPackaged: app.isPackaged,
        appName: app.name,
        openExternal: (url) => void shell.openExternal(url)
      })
    )
  )

  backgroundRunEnabled = readBackgroundRunEnabled(app.getPath('userData'))
  syncTray()

  ipcMain.handle('everylist:check-for-update', () => checkForUpdate(packageJson.version))
  ipcMain.handle('everylist:set-background-run', (_event, enabled) => {
    backgroundRunEnabled = Boolean(enabled)
    writeBackgroundRunEnabled(app.getPath('userData'), backgroundRunEnabled)
    syncTray()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  await createWindow()

  app.on('activate', () => {
    if (!mainWindow) void createWindow()
  })
}

app.on('window-all-closed', () => {
  if (shouldQuitOnAllWindowsClosed(process.platform)) app.quit()
})

boot().catch((error) => {
  persistStartupError(error)
  dialog.showErrorBox('EveryList failed to start', String(error?.stack ?? error))
  app.exit(1)
})
