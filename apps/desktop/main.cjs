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
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, safeStorage } = require('electron')

const { readConfig, STANDALONE_DEFAULT_PORT } = require('./lib/config.cjs')
const { createStaticServer, listen } = require('./lib/static-server.cjs')
const { readWindowState, writeWindowState, clampWindowState } = require('./lib/window-state.cjs')
const { shouldOpenExternally, isAppOrigin } = require('./lib/navigation.cjs')
const { checkForUpdate } = require('./lib/update-check.cjs')
const { readBackgroundRunEnabled, writeBackgroundRunEnabled } = require('./lib/background-run.cjs')
const { buildTrayMenuTemplate, shouldHideInsteadOfClose } = require('./lib/tray.cjs')
const { readMode, writeMode } = require('./lib/standalone-mode.cjs')
const {
  getDataDir,
  startEmbeddedServer,
  waitForHealth,
  provisionOwner,
  persistOwnerCredentials,
  loadOwnerCredentials,
  reauthenticateOwner,
  stopEmbeddedServer
} = require('./lib/embedded-server.cjs')
const packageJson = require('./package.json')

// The renderer is the exact same `apps/web/build` output that serves Docker/PWA/Capacitor — see
// §6 for how it lands at this path once packaged (electron-builder's `files` mapping copies
// apps/web/build to ./renderer next to this file; unpackaged dev expects the same layout via a
// prepackage/copy step). Resolved from __dirname, never process.cwd() — a Finder/Explorer launch
// has a cwd of "/".
const RENDERER_ROOT = path.join(__dirname, 'renderer')

// Standalone mode's staged `apps/api` build (scripts/copy-api-server.mjs) — packaged as an
// `extraResources` entry (see package.json's `build.extraResources`), not through `files`/asar.
// `files`-based inclusion runs every entry through electron-builder's own dependency-tree-aware
// node_modules handling (`app-builder`'s `node-dep-tree`), which only knows about this package's
// own (empty) `dependencies` field and silently drops the entire vendored `server/node_modules`
// regardless of `asarUnpack` — confirmed by actually packaging the app and inspecting the
// resulting .app bundle before this fix. `extraResources` copies the directory verbatim into
// `Resources/server` with no such handling, and needs no asar-unpack path substitution since it's
// never asar-packed in the first place. `process.resourcesPath` only points at this project's own
// resources once packaged (`app.isPackaged`); in dev (`electron .`) it points at Electron's own
// bundled Resources folder instead, so dev falls back to the plain on-disk path.
const SERVER_APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'server')
  : path.join(__dirname, 'server')

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {number} */
let appPort = 0
/** @type {import('node:http').Server | null} */
let staticServer = null
/** @type {import('node:child_process').ChildProcess | null} */
let embeddedServerChild = null
/** @type {string | null} */
let pendingStandaloneToken = null
/** @type {Tray | null} */
let tray = null
let backgroundRunEnabled = false
let isQuitting = false
// Suppresses the embedded server's "stopped unexpectedly" dialog for a stop *we* triggered (e.g.
// enableStandalone rolling back after a failed switch) — that dialog is only meant for a genuine
// unexpected exit while standalone mode is the app's normal, settled state.
let suppressEmbeddedServerExitDialog = false
/** @type {Promise<{ port: number }> | null} */
let enableStandaloneInFlight = null

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

/** Appends the embedded server's stdout/stderr to its own log file — a separate file from
 * startup-error.log (not routed through logStartupError) because the server streams many chunks,
 * and writeFileSync there would truncate to just the last chunk, destroying whatever startup
 * error it was meant to capture along with all but the final line of server output.
 * @param {string} userDataDir
 * @param {string} chunk
 */
function appendEmbeddedServerLog(userDataDir, chunk) {
  const logPath = path.join(userDataDir, 'embedded-server.log')
  fs.promises.appendFile(logPath, chunk).catch(() => {
    // Same reasoning as logStartupError's catch — nowhere else to report a logging failure.
  })
}

/** @param {string} plainText */
function encryptOwnerCredentials(plainText) {
  return safeStorage.encryptString(plainText)
}

/** @param {Buffer} buffer */
function decryptOwnerCredentials(buffer) {
  return safeStorage.decryptString(buffer)
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

/** Creates or destroys the tray icon to match `backgroundRunEnabled` — see
 * PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md §"Electron". Idempotent. */
function syncTray() {
  if (backgroundRunEnabled && !tray) {
    tray = new Tray(path.join(__dirname, 'resources', 'icon.png'))
    tray.setToolTip('EveryList')
    tray.setContextMenu(
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
    tray.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } else if (!backgroundRunEnabled && tray) {
    tray.destroy()
    tray = null
  }
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
  mainWindow.on('close', (event) => {
    persistState()
    if (!isQuitting && shouldHideInsteadOfClose(backgroundRunEnabled)) {
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
 * Today's thin-client behavior, unchanged: serve `renderer/` from the fixed loopback port.
 * @param {string} userDataDir
 */
async function bootRemote(userDataDir) {
  const { port } = readConfig(userDataDir)
  staticServer = createStaticServer(RENDERER_ROOT)
  try {
    await listen(staticServer, port)
  } catch (error) {
    if (
      error instanceof Error &&
      /** @type {NodeJS.ErrnoException} */ (error).code === 'EADDRINUSE'
    ) {
      dialog.showErrorBox(
        'EveryList — port already in use',
        `EveryList couldn't bind to 127.0.0.1:${port} — something else on this machine is ` +
          'already using it.\n\n' +
          `Override the port by creating a config.json file at:\n${path.join(userDataDir, 'config.json')}\n` +
          'with contents like: { "port": 41784 }\n\n' +
          "Note: changing the port changes the app's origin, which resets the locally " +
          'stored server URL, login token and offline cache (your server-side data is untouched).'
      )
    }
    throw error
  }
  appPort = port
}

/**
 * Standalone mode (PLAN_31_PHASE_DESKTOP_STANDALONE_MODE.md): boots the embedded AdonisJS+SQLite
 * server and waits for it to report healthy before returning, so nothing ever navigates to a
 * connection-refused origin.
 * @param {string} userDataDir
 */
async function bootStandalone(userDataDir) {
  const port = STANDALONE_DEFAULT_PORT
  const { child, dataDir } = startEmbeddedServer({
    appDir: SERVER_APP_DIR,
    userDataDir,
    port,
    onLog: (chunk) => appendEmbeddedServerLog(userDataDir, chunk)
  })
  embeddedServerChild = child
  child.on('exit', (code, signal) => {
    embeddedServerChild = null
    if (isQuitting || suppressEmbeddedServerExitDialog) return
    dialog.showErrorBox(
      'EveryList — local server stopped',
      `The embedded server exited unexpectedly (code=${code}, signal=${signal}). ` +
        'Restart EveryList to try again; your data on disk is untouched.'
    )
  })
  // Passing `child` closes the port-collision gap where our own spawn's bind fails and it exits,
  // but the port still answers /api/v1/meta because something else (or a stale prior instance) is
  // listening there — see waitForHealth's own doc comment.
  await waitForHealth(port, { child })
  appPort = port

  // Recovers a token that expired (30-day lifetime — see apps/api's User.accessTokens config) or
  // was otherwise lost from the renderer's storage, since standalone mode hides the login screen
  // entirely and has no other way back in. A no-op on the very first boot: enableStandalone()
  // provisions fresh credentials (and persists them) right after this function returns, so no
  // credentials file exists yet at this point in that call.
  if (safeStorage.isEncryptionAvailable()) {
    const credentials = loadOwnerCredentials(dataDir, { decryptImpl: decryptOwnerCredentials })
    if (credentials) {
      try {
        pendingStandaloneToken = await reauthenticateOwner(port, credentials)
      } catch (error) {
        logStartupError(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }
}

/**
 * IPC handler backing `window.everylistDesktop.enableStandalone()` — the one-time choice a user
 * makes from /server-setup's "Use EveryList on this device only" button. Idempotent: a second
 * call (e.g. a double-click) after the first has already switched modes just reports the current
 * port rather than trying to boot a second embedded server — checked via `embeddedServerChild`
 * actually running, not just the saved mode marker, so a *failed* previous attempt (mode never
 * written — see below) correctly falls through to retry rather than reporting stale success.
 *
 * The mode marker is written only after the embedded server has booted and the owner has been
 * provisioned — writing it earlier would mean a failure partway through (port in use, a migration
 * error, provisioning rejected) leaves `readMode()` reporting 'standalone' with no server actually
 * running and no owner account, which every later launch (and every retry of this same button)
 * would then also try and fail to recover from. On failure, the embedded server (if it started at
 * all) is stopped and the thin static server is restored, so the app is left exactly as it was
 * before the attempt and the error propagates to /server-setup's own error message.
 *
 * Single-flight: two concurrent calls (a double-click before the first `ipcRenderer.invoke`
 * resolves) would otherwise both read the same "not yet standalone" state and race on
 * `embeddedServerChild`/`staticServer`/`pendingStandaloneToken` — e.g. one call's rollback closing
 * the embedded server the other call just booted. A single in-flight promise, shared by every
 * caller until the attempt settles, makes a second click during setup just await the first click's
 * outcome instead of starting an independent, colliding attempt.
 * @returns {Promise<{ port: number }>}
 */
function enableStandalone() {
  if (!enableStandaloneInFlight) {
    enableStandaloneInFlight = enableStandaloneOnce().finally(() => {
      enableStandaloneInFlight = null
    })
  }
  return enableStandaloneInFlight
}

/** @returns {Promise<{ port: number }>} */
async function enableStandaloneOnce() {
  const userDataDir = app.getPath('userData')
  if (embeddedServerChild && readMode(userDataDir) === 'standalone') {
    return { port: appPort }
  }

  // Refused up front rather than silently proceeding without a recovery net: standalone mode
  // hides the login screen entirely, so the generated owner credentials persisted below are the
  // *only* way back in if the renderer's token is ever lost (cleared, or its 30-day expiry
  // lapses). Without safeStorage there's nowhere safe to persist them, and enabling standalone
  // anyway would mean that loss permanently strands the owner with no recourse.
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Standalone mode requires this OS session to support secure credential storage ' +
        '(Electron safeStorage), which is unavailable right now.'
    )
  }

  if (staticServer) {
    staticServer.close()
    staticServer = null
  }

  try {
    await bootStandalone(userDataDir)
    // An owner can already exist here — mode.json was deleted and standalone re-chosen (see
    // docs/desktop.md's reset instructions, which keep server/everylist.sqlite3), or the app
    // crashed/quit between provisionOwner and writeMode below on a previous attempt.
    // bootStandalone has then already re-authenticated from the credentials persisted last time,
    // populating pendingStandaloneToken — calling provisionOwner again would only get a 409 from
    // an instance that already has its one allowed user, permanently blocking every retry. No
    // form is shown for the first-run provisioning case — see PLAN_31 §"First-run flow" step 4.
    // The renderer picks the token up via consumeStandaloneToken() once it reloads below.
    if (!pendingStandaloneToken) {
      const { token, email, password } = await provisionOwner(appPort)
      pendingStandaloneToken = token
      // safeStorage availability was already asserted above, before anything was booted.
      persistOwnerCredentials(
        getDataDir(userDataDir),
        { email, password },
        { encryptImpl: encryptOwnerCredentials }
      )
    }
  } catch (error) {
    // Never left set from a failed attempt — the thin-client origin this rolls back to must not
    // consume a token minted for a server that's no longer running.
    pendingStandaloneToken = null
    suppressEmbeddedServerExitDialog = true
    if (embeddedServerChild) await stopEmbeddedServer(embeddedServerChild)
    suppressEmbeddedServerExitDialog = false
    await bootRemote(userDataDir)
    throw error
  }

  writeMode(userDataDir, 'standalone')
  await mainWindow?.loadURL(`http://127.0.0.1:${appPort}/`)
  return { port: appPort }
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

  const userDataDir = app.getPath('userData')
  // A missing/null marker means "no choice made yet" — behaves exactly as every desktop install
  // did before this feature existed (thin static-client server, remote server configured via
  // /server-setup). Only an explicit 'standalone' marker changes the boot path.
  if (readMode(userDataDir) === 'standalone') {
    await bootStandalone(userDataDir)
  } else {
    await bootRemote(userDataDir)
  }

  Menu.setApplicationMenu(buildMenu())

  backgroundRunEnabled = readBackgroundRunEnabled(userDataDir)
  syncTray()

  ipcMain.handle('everylist:check-for-update', () => checkForUpdate(packageJson.version))
  ipcMain.handle('everylist:set-background-run', (_event, enabled) => {
    backgroundRunEnabled = Boolean(enabled)
    writeBackgroundRunEnabled(userDataDir, backgroundRunEnabled)
    syncTray()
  })
  ipcMain.handle('everylist:enable-standalone', () => enableStandalone())
  ipcMain.on('everylist:get-mode', (event) => {
    event.returnValue = readMode(userDataDir) ?? 'remote'
  })
  ipcMain.on('everylist:consume-standalone-token', (event) => {
    event.returnValue = pendingStandaloneToken
    pendingStandaloneToken = null
  })

  app.on('before-quit', () => {
    isQuitting = true
    // Best-effort: SQLite's WAL mode already makes a hard kill safe, so this isn't awaited —
    // blocking app quit on a child process shutdown isn't worth the complexity it'd add here.
    if (embeddedServerChild) void stopEmbeddedServer(embeddedServerChild)
  })

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
