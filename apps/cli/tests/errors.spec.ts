import { describe, expect, it } from 'vitest'
import { version } from '../src/version.js'
import { AuthError, CliError, UsageError } from '../src/errors.js'

describe('version', () => {
  it('returns the version from package.json', () => {
    expect(version()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('error classes', () => {
  it('CliError defaults to exit code 1', () => {
    const error = new CliError('boom')
    expect(error.exitCode).toBe(1)
    expect(error.name).toBe('CliError')
    expect(error).toBeInstanceOf(Error)
  })

  it('CliError accepts an explicit exit code', () => {
    expect(new CliError('boom', 3).exitCode).toBe(3)
  })

  it('UsageError is exit code 2', () => {
    const error = new UsageError('bad usage')
    expect(error.exitCode).toBe(2)
    expect(error.name).toBe('UsageError')
    expect(error).toBeInstanceOf(CliError)
  })

  it('AuthError is exit code 3', () => {
    const error = new AuthError('no token')
    expect(error.exitCode).toBe(3)
    expect(error.name).toBe('AuthError')
    expect(error).toBeInstanceOf(CliError)
  })
})
