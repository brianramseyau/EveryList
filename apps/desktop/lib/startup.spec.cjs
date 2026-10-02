'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  logStartupError,
  isPortInUseError,
  portInUseMessage,
  secondInstanceAction,
  applySecondInstanceAction,
  reportPortConflictIfAny,
  shouldQuitOnAllWindowsClosed
} = require('./startup.cjs')

describe('logStartupError', () => {
  /** @type {string} */
  let userDataDir

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-startup-'))
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('writes the stack and returns true', () => {
    const ok = logStartupError({ userDataDir, error: new Error('boom') })
    expect(ok).toBe(true)
    const written = fs.readFileSync(path.join(userDataDir, 'startup-error.log'), 'utf8')
    expect(written).toContain('boom')
  })

  it('stringifies a non-Error value', () => {
    logStartupError({ userDataDir, error: 'plain string failure' })
    const written = fs.readFileSync(path.join(userDataDir, 'startup-error.log'), 'utf8')
    expect(written).toContain('plain string failure')
  })

  it('an Error with no stack falls back to its toString', () => {
    const error = new Error('no stack')
    error.stack = undefined
    logStartupError({ userDataDir, error })
    expect(fs.readFileSync(path.join(userDataDir, 'startup-error.log'), 'utf8')).toContain(
      'no stack'
    )
  })

  it('returns false rather than throwing when userData is not writable', () => {
    expect(
      logStartupError({ userDataDir: '/proc/definitely/not/writable', error: new Error('x') })
    ).toBe(false)
  })
})

describe('isPortInUseError', () => {
  it('is true only for an EADDRINUSE Error', () => {
    const inUse = Object.assign(new Error('in use'), { code: 'EADDRINUSE' })
    expect(isPortInUseError(inUse)).toBe(true)
    expect(isPortInUseError(Object.assign(new Error('other'), { code: 'ECONNREFUSED' }))).toBe(
      false
    )
    expect(isPortInUseError('EADDRINUSE')).toBe(false)
    expect(isPortInUseError(null)).toBe(false)
  })
})

describe('portInUseMessage', () => {
  it('names the port and the config path, and warns about the origin reset', () => {
    const message = portInUseMessage({ port: 41783, userDataDir: '/home/u/.config/EveryList' })
    expect(message).toContain('127.0.0.1:41783')
    expect(message).toContain(path.join('/home/u/.config/EveryList', 'config.json'))
    expect(message).toContain("changes the app's origin")
  })
})

describe('secondInstanceAction', () => {
  it('does nothing when there is no window', () => {
    expect(secondInstanceAction({ hasWindow: false, isMinimized: false })).toEqual({
      restore: false,
      focus: false
    })
  })

  it('focuses a visible window without restoring', () => {
    expect(secondInstanceAction({ hasWindow: true, isMinimized: false })).toEqual({
      restore: false,
      focus: true
    })
  })

  it('restores a minimized window before focusing', () => {
    expect(secondInstanceAction({ hasWindow: true, isMinimized: true })).toEqual({
      restore: true,
      focus: true
    })
  })
})

describe('shouldQuitOnAllWindowsClosed', () => {
  it('is true off macOS and false on it', () => {
    expect(shouldQuitOnAllWindowsClosed('win32')).toBe(true)
    expect(shouldQuitOnAllWindowsClosed('linux')).toBe(true)
    expect(shouldQuitOnAllWindowsClosed('darwin')).toBe(false)
  })
})

describe('applySecondInstanceAction', () => {
  it('does nothing with no window', () => {
    /** @type {string[]} */
    const calls = []
    const result = applySecondInstanceAction({
      hasWindow: false,
      isMinimized: false,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus')
    })
    expect(calls).toEqual([])
    expect(result).toEqual({ restore: false, focus: false })
  })

  it('focuses a visible window without restoring', () => {
    /** @type {string[]} */
    const calls = []
    applySecondInstanceAction({
      hasWindow: true,
      isMinimized: false,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus')
    })
    expect(calls).toEqual(['focus'])
  })

  it('restores a minimized window before focusing', () => {
    /** @type {string[]} */
    const calls = []
    applySecondInstanceAction({
      hasWindow: true,
      isMinimized: true,
      restore: () => calls.push('restore'),
      focus: () => calls.push('focus')
    })
    expect(calls).toEqual(['restore', 'focus'])
  })
})

describe('reportPortConflictIfAny', () => {
  it('shows the port-in-use dialog for an EADDRINUSE error', () => {
    /** @type {{ title: string, message: string }[]} */
    const shown = []
    const handled = reportPortConflictIfAny({
      error: Object.assign(new Error('in use'), { code: 'EADDRINUSE' }),
      port: 41783,
      userDataDir: '/home/u/.config/EveryList',
      showErrorBox: (title, message) => shown.push({ title, message })
    })
    expect(handled).toBe(true)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.title).toContain('port already in use')
    expect(shown[0]?.message).toContain('127.0.0.1:41783')
  })

  it('shows nothing and reports false for any other error', () => {
    /** @type {unknown[][]} */
    const shown = []
    const handled = reportPortConflictIfAny({
      error: new Error('something else'),
      port: 41783,
      userDataDir: '/home/u/.config/EveryList',
      showErrorBox: (...args) => shown.push(args)
    })
    expect(handled).toBe(false)
    expect(shown).toEqual([])
  })
})
