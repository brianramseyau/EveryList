'use strict'

/**
 * Builds the application menu template — pulled out of main.cjs so the platform/packaging
 * branches it makes are unit-tested (PLAN_36_PHASE_NATIVE_TEST_COVERAGE.md). Passes plain
 * `shell.openExternal` in as a callback rather than requiring Electron, so the template is
 * pure data.
 */

const RELEASES_URL = 'https://github.com/brianramseyau/EveryList/releases'

/**
 * @typedef {object} BuildMenuArgs
 * @property {string} platform
 * @property {boolean} isPackaged
 * @property {string} appName
 * @property {(url: string) => void} openExternal
 */

/**
 * @param {BuildMenuArgs} args
 * @returns {Array<Record<string, unknown>>}
 */
function buildMenuTemplate({ platform, isPackaged, appName, openExternal }) {
  /** @type {Array<Record<string, unknown>>} */
  const template = []

  // The standard macOS application menu (About/Services/Hide/Quit) — only there; Windows/Linux
  // get these roles from their own window menu.
  if (platform === 'darwin') {
    template.push({
      label: appName,
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

  /** @type {Array<Record<string, unknown>>} */
  const viewSubmenu = [
    { role: 'reload' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]
  // DevTools is a dev-only affordance; never offered in a packaged build.
  if (!isPackaged) viewSubmenu.push({ role: 'toggleDevTools' })
  template.push({ label: 'View', submenu: viewSubmenu })

  template.push({ role: 'windowMenu' })

  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'View EveryList releases',
        click: () => openExternal(RELEASES_URL)
      }
    ]
  })

  return template
}

module.exports = { buildMenuTemplate, RELEASES_URL }
