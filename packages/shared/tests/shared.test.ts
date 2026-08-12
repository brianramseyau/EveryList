import { describe, expect, it } from 'vitest'
import { API_VERSION, assertNever } from '../src/index.js'

describe('assertNever', () => {
  it('throws for any value it is called with', () => {
    expect(() => assertNever('unexpected' as never)).toThrow('Unhandled case')
  })
})

describe('API_VERSION', () => {
  it('is the current API version segment', () => {
    expect(API_VERSION).toBe('v1')
  })
})
