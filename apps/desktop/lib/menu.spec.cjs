'use strict'

const { buildMenuTemplate, RELEASES_URL } = require('./menu.cjs')

const base = { isPackaged: true, appName: 'EveryList', openExternal: () => {} }

describe('buildMenuTemplate', () => {
  it('includes the macOS application menu only on darwin', () => {
    const mac = buildMenuTemplate({ ...base, platform: 'darwin' })
    expect(mac[0]).toMatchObject({ label: 'EveryList' })

    const linux = buildMenuTemplate({ ...base, platform: 'linux' })
    expect(linux[0]).toMatchObject({ label: 'Edit' })
  })

  it('omits DevTools from the View menu when packaged, includes it when not', () => {
    const packaged = buildMenuTemplate({ ...base, platform: 'linux', isPackaged: true })
    const viewPackaged = /** @type {any} */ (packaged.find((item) => item.label === 'View'))
    expect(viewPackaged.submenu).not.toContainEqual({ role: 'toggleDevTools' })

    const dev = buildMenuTemplate({ ...base, platform: 'linux', isPackaged: false })
    const viewDev = /** @type {any} */ (dev.find((item) => item.label === 'View'))
    expect(viewDev.submenu).toContainEqual({ role: 'toggleDevTools' })
  })

  it('opens the releases page from the Help menu', () => {
    /** @type {string[]} */
    const opened = []
    const template = buildMenuTemplate({
      ...base,
      platform: 'linux',
      openExternal: (url) => opened.push(url)
    })
    const help = /** @type {any} */ (template.find((item) => item.label === 'Help'))
    help.submenu[0].click()
    expect(opened).toEqual([RELEASES_URL])
  })

  it('always ends with a window menu', () => {
    const template = buildMenuTemplate({ ...base, platform: 'linux' })
    expect(template).toContainEqual({ role: 'windowMenu' })
  })
})
