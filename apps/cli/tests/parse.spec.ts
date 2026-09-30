import { describe, expect, it } from 'vitest'
import { parsePriceFlag } from '../src/parse.js'
import { UsageError } from '../src/errors.js'

describe('parsePriceFlag', () => {
  it('converts a decimal amount to integer cents', () => {
    expect(parsePriceFlag('12.99')).toBe(1299)
  })

  it('treats a whole number as dollars', () => {
    expect(parsePriceFlag('5')).toBe(500)
  })

  it('strips a currency symbol and thousands separators', () => {
    expect(parsePriceFlag('$1,234.56')).toBe(123456)
  })

  it('accepts zero', () => {
    expect(parsePriceFlag('0')).toBe(0)
  })

  it('rejects an empty value', () => {
    expect(() => parsePriceFlag('')).toThrow(UsageError)
  })

  it('rejects a non-numeric value', () => {
    expect(() => parsePriceFlag('abc')).toThrow('--price must be a non-negative number')
  })

  it('rejects a negative value', () => {
    expect(() => parsePriceFlag('-3')).toThrow(UsageError)
  })

  it('rejects letters even when digits are present', () => {
    expect(() => parsePriceFlag('abc12.34')).toThrow(UsageError)
    expect(() => parsePriceFlag('2x3.50')).toThrow(UsageError)
  })

  it('rejects scientific notation rather than reinterpreting it', () => {
    expect(() => parsePriceFlag('1e3')).toThrow(UsageError)
  })

  it('rejects an out-of-range value that parses to Infinity', () => {
    expect(() => parsePriceFlag('9'.repeat(400))).toThrow('--price is out of range')
  })
})
