'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { readConfig, DEFAULT_PORT, STANDALONE_DEFAULT_PORT } = require('./config.cjs')

describe('readConfig', () => {
  /** @type {string} */
  let userDataDir

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-config-'))
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('defaults both ports when config.json is missing', () => {
    expect(readConfig(userDataDir)).toEqual({
      port: DEFAULT_PORT,
      standalonePort: STANDALONE_DEFAULT_PORT
    })
  })

  it('defaults when config.json is malformed JSON', () => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), '{ not json')
    expect(readConfig(userDataDir)).toEqual({
      port: DEFAULT_PORT,
      standalonePort: STANDALONE_DEFAULT_PORT
    })
  })

  it.each([
    ['a string', '{"port": "8080"}'],
    ['zero', '{"port": 0}'],
    ['negative', '{"port": -1}'],
    ['non-integer', '{"port": 41783.5}'],
    ['out of range', '{"port": 70000}'],
    ['null port', '{"port": null}'],
    ['root is a number', '42'],
    ['root is null', 'null']
  ])('defaults the port when the value is invalid: %s', (_label, contents) => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), contents)
    expect(readConfig(userDataDir)).toEqual({
      port: DEFAULT_PORT,
      standalonePort: STANDALONE_DEFAULT_PORT
    })
  })

  it.each([
    ['a string', '{"standalonePort": "8080"}'],
    ['zero', '{"standalonePort": 0}'],
    ['out of range', '{"standalonePort": 70000}']
  ])('defaults the standalone port when the value is invalid: %s', (_label, contents) => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), contents)
    expect(readConfig(userDataDir)).toEqual({
      port: DEFAULT_PORT,
      standalonePort: STANDALONE_DEFAULT_PORT
    })
  })

  it('honors a valid port override', () => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), '{"port": 5555}')
    expect(readConfig(userDataDir)).toEqual({
      port: 5555,
      standalonePort: STANDALONE_DEFAULT_PORT
    })
  })

  it('honors a valid standalonePort override', () => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), '{"standalonePort": 6666}')
    expect(readConfig(userDataDir)).toEqual({
      port: DEFAULT_PORT,
      standalonePort: 6666
    })
  })

  it('honors both overrides at once', () => {
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      '{"port": 5555, "standalonePort": 6666}'
    )
    expect(readConfig(userDataDir)).toEqual({ port: 5555, standalonePort: 6666 })
  })
})
