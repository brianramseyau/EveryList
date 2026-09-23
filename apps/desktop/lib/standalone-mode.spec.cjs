'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readMode, writeMode } = require('./standalone-mode.cjs')

describe('readMode / writeMode', () => {
  /** @type {string} */
  let userDataDir

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-mode-'))
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('is null when mode.json is missing', () => {
    expect(readMode(userDataDir)).toBeNull()
  })

  it('is null when mode.json is malformed JSON', () => {
    fs.writeFileSync(path.join(userDataDir, 'mode.json'), '{ not json')
    expect(readMode(userDataDir)).toBeNull()
  })

  it.each([
    ['root is a number', '42'],
    ['root is null', 'null'],
    ['mode is an unknown string', '{"mode": "banana"}'],
    ['mode is missing', '{}']
  ])('is null when the value is invalid: %s', (_label, contents) => {
    fs.writeFileSync(path.join(userDataDir, 'mode.json'), contents)
    expect(readMode(userDataDir)).toBeNull()
  })

  it('round-trips a written standalone mode', () => {
    writeMode(userDataDir, 'standalone')
    expect(readMode(userDataDir)).toBe('standalone')
  })

  it('round-trips a written remote mode', () => {
    writeMode(userDataDir, 'standalone')
    writeMode(userDataDir, 'remote')
    expect(readMode(userDataDir)).toBe('remote')
  })
})
