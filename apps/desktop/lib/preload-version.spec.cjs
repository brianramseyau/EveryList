'use strict'

const { parseVersionArg, VERSION_ARG_PREFIX } = require('./preload-version.cjs')

describe('parseVersionArg', () => {
  it('reads the value out of a matching argument', () => {
    expect(parseVersionArg(['electron', `${VERSION_ARG_PREFIX}1.2.3`])).toBe('1.2.3')
  })

  it('finds it among other arguments', () => {
    expect(parseVersionArg(['--foo', `${VERSION_ARG_PREFIX}9.9.9`, '--bar'])).toBe('9.9.9')
  })

  it('falls back to "unknown" when absent', () => {
    expect(parseVersionArg(['electron', '.'])).toBe('unknown')
  })

  it('uses a custom fallback when given', () => {
    expect(parseVersionArg([], '0.0.0')).toBe('0.0.0')
  })

  it('tolerates a non-array argv', () => {
    expect(parseVersionArg(/** @type {any} */ (undefined))).toBe('unknown')
  })

  it('returns an empty string when the argument carries no value', () => {
    expect(parseVersionArg([VERSION_ARG_PREFIX])).toBe('')
  })
})
