'use strict'

const {
  buildWindowOptions,
  shouldMaximize,
  shouldHideOnClose,
  shouldSetDockIcon,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MAX_WINDOW_WIDTH
} = require('./window-options.cjs')

const base = {
  isPackaged: true,
  platform: 'linux',
  iconPath: '/app/resources/icon.png',
  preloadPath: '/app/preload.cjs',
  version: '1.2.3'
}

describe('buildWindowOptions', () => {
  it('uses the default size when there is no state to restore', () => {
    const options = buildWindowOptions({ ...base, clamped: null })
    expect(options.width).toBe(DEFAULT_WINDOW_WIDTH)
    expect(options.height).toBe(DEFAULT_WINDOW_HEIGHT)
    expect(options.x).toBeUndefined()
    expect(options.y).toBeUndefined()
  })

  it('restores width/height/x/y from clamped state', () => {
    const options = buildWindowOptions({
      ...base,
      clamped: { x: 10, y: 20, width: 900, height: 700, isMaximized: false }
    })
    expect(options).toMatchObject({ x: 10, y: 20, width: 900, height: 700 })
  })

  it('restores size but no position when the state carried no x/y', () => {
    const options = buildWindowOptions({
      ...base,
      clamped: { width: 900, height: 700, isMaximized: false }
    })
    expect(options.width).toBe(900)
    expect(options.height).toBe(700)
    expect(options.x).toBeUndefined()
    expect(options.y).toBeUndefined()
  })

  it('falls back per-dimension for a partial state', () => {
    const options = buildWindowOptions({
      ...base,
      clamped: /** @type {any} */ ({ height: 700 })
    })
    expect(options.width).toBe(DEFAULT_WINDOW_WIDTH)
    expect(options.height).toBe(700)
  })

  it('caps the width and keeps the app content column margins', () => {
    const options = buildWindowOptions({ ...base, clamped: null })
    expect(options.maxWidth).toBe(MAX_WINDOW_WIDTH)
    expect(options.minWidth).toBe(380)
    expect(options.minHeight).toBe(520)
    expect(options.fullscreenable).toBe(false)
    expect(options.backgroundColor).toBe('#f6f5f1')
  })

  it('hides the menu bar everywhere except macOS', () => {
    expect(buildWindowOptions({ ...base, clamped: null, platform: 'darwin' }).autoHideMenuBar).toBe(
      false
    )
    expect(buildWindowOptions({ ...base, clamped: null, platform: 'win32' }).autoHideMenuBar).toBe(
      true
    )
    expect(buildWindowOptions({ ...base, clamped: null, platform: 'linux' }).autoHideMenuBar).toBe(
      true
    )
  })

  it('only sets the dev icon when unpackaged', () => {
    expect(buildWindowOptions({ ...base, clamped: null, isPackaged: false }).icon).toBe(
      base.iconPath
    )
    expect(buildWindowOptions({ ...base, clamped: null, isPackaged: true }).icon).toBeUndefined()
  })

  it('configures the sandboxed preload with the injected version', () => {
    const options = buildWindowOptions({ ...base, clamped: null })
    expect(options.webPreferences).toEqual({
      preload: base.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ['--everylist-version=1.2.3']
    })
  })
})

describe('shouldMaximize', () => {
  it('is true only when the clamped state asked for maximized', () => {
    expect(shouldMaximize({ width: 1, height: 2, isMaximized: true })).toBe(true)
    expect(shouldMaximize({ width: 1, height: 2, isMaximized: false })).toBe(false)
    expect(shouldMaximize(null)).toBe(false)
  })
})

describe('shouldHideOnClose', () => {
  it('hides to the tray only while running in the background and not quitting', () => {
    expect(shouldHideOnClose({ isQuitting: false, backgroundRunEnabled: true })).toBe(true)
    expect(shouldHideOnClose({ isQuitting: false, backgroundRunEnabled: false })).toBe(false)
    expect(shouldHideOnClose({ isQuitting: true, backgroundRunEnabled: true })).toBe(false)
  })
})

describe('shouldSetDockIcon', () => {
  it('is true only for an unpackaged macOS dev run', () => {
    expect(shouldSetDockIcon({ isPackaged: false, platform: 'darwin' })).toBe(true)
    expect(shouldSetDockIcon({ isPackaged: true, platform: 'darwin' })).toBe(false)
    expect(shouldSetDockIcon({ isPackaged: false, platform: 'linux' })).toBe(false)
    expect(shouldSetDockIcon({ isPackaged: false, platform: 'win32' })).toBe(false)
  })
})
