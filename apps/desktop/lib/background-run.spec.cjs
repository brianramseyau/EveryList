'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readBackgroundRunEnabled, writeBackgroundRunEnabled } = require('./background-run.cjs')

describe('readBackgroundRunEnabled / writeBackgroundRunEnabled', () => {
  /** @type {string} */
  let userDataDir

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-background-run-'))
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('defaults to false when the file is missing', () => {
    expect(readBackgroundRunEnabled(userDataDir)).toBe(false)
  })

  it('defaults to false when the file is malformed JSON', () => {
    fs.writeFileSync(path.join(userDataDir, 'background-run.json'), '{ not json')
    expect(readBackgroundRunEnabled(userDataDir)).toBe(false)
  })

  it.each([
    ['root is a number', '42'],
    ['root is null', 'null'],
    ['enabled is a string', '{"enabled": "true"}'],
    ['enabled is missing', '{}']
  ])('defaults to false when the value is invalid: %s', (_label, contents) => {
    fs.writeFileSync(path.join(userDataDir, 'background-run.json'), contents)
    expect(readBackgroundRunEnabled(userDataDir)).toBe(false)
  })

  it('round-trips a written true value', () => {
    writeBackgroundRunEnabled(userDataDir, true)
    expect(readBackgroundRunEnabled(userDataDir)).toBe(true)
  })

  it('round-trips a written false value', () => {
    writeBackgroundRunEnabled(userDataDir, true)
    writeBackgroundRunEnabled(userDataDir, false)
    expect(readBackgroundRunEnabled(userDataDir)).toBe(false)
  })
})
