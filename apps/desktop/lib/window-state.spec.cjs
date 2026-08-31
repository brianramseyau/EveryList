'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readWindowState, writeWindowState, clampWindowState } = require('./window-state.cjs')

describe('readWindowState / writeWindowState', () => {
  /** @type {string} */
  let userDataDir

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-window-'))
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('returns null when the file is missing', () => {
    expect(readWindowState(userDataDir)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    fs.writeFileSync(path.join(userDataDir, 'window-state.json'), '{ nope')
    expect(readWindowState(userDataDir)).toBeNull()
  })

  it('returns null when dimensions are missing', () => {
    fs.writeFileSync(path.join(userDataDir, 'window-state.json'), '{"isMaximized": true}')
    expect(readWindowState(userDataDir)).toBeNull()
  })

  it('round-trips a written state', () => {
    const state = { x: 10, y: 20, width: 1100, height: 820, isMaximized: false }
    writeWindowState(userDataDir, state)
    expect(readWindowState(userDataDir)).toEqual(state)
  })
})

describe('clampWindowState', () => {
  const displays = [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]

  it('returns null when there is nothing to restore', () => {
    expect(clampWindowState(null, displays)).toBeNull()
  })

  it('returns null when the persisted size is not positive', () => {
    expect(clampWindowState({ width: 0, height: 820, isMaximized: false }, displays)).toBeNull()
  })

  it('caps an absurd persisted size', () => {
    const result = clampWindowState({ width: 999999, height: 999999, isMaximized: false }, displays)
    expect(result).toEqual({ width: 10000, height: 10000, isMaximized: false })
  })

  it('keeps position and size when the window is still on a known display', () => {
    const state = { x: 100, y: 100, width: 1100, height: 820, isMaximized: false }
    expect(clampWindowState(state, displays)).toEqual(state)
  })

  it('drops position (keeps size) when no position was persisted', () => {
    const state = { width: 1100, height: 820, isMaximized: true }
    expect(clampWindowState(state, displays)).toEqual({
      width: 1100,
      height: 820,
      isMaximized: true
    })
  })

  it('drops position when the persisted display is no longer present', () => {
    const state = { x: 5000, y: 5000, width: 1100, height: 820, isMaximized: false }
    expect(clampWindowState(state, displays)).toEqual({
      width: 1100,
      height: 820,
      isMaximized: false
    })
  })

  it('drops position when there are no displays at all', () => {
    const state = { x: 100, y: 100, width: 1100, height: 820, isMaximized: false }
    expect(clampWindowState(state, [])).toEqual({ width: 1100, height: 820, isMaximized: false })
  })
})
