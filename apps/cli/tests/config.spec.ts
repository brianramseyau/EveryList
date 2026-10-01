import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  configDir,
  configPath,
  maskToken,
  readConfig,
  requireBaseUrl,
  resolveBaseUrl,
  resolveToken,
  writeConfig
} from '../src/config.js'
import { CliError } from '../src/errors.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-cli-test-'))
}

const created: string[] = []
afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('configDir / configPath', () => {
  /** Runs `fn` with `process.platform` stubbed, restoring the real value afterwards — these
   *  branches are platform-specific, so the test must pin the platform rather than inherit the
   *  host's (which would fail on a macOS/Windows dev machine or runner). */
  function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      fn()
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  }

  it('honors EVERYLIST_CONFIG_DIR', () => {
    const env = { EVERYLIST_CONFIG_DIR: '/tmp/explicit-everylist' }
    expect(configDir(env)).toBe('/tmp/explicit-everylist')
    expect(configPath(env)).toBe('/tmp/explicit-everylist/config.json')
  })

  it('falls back to an XDG config path on linux', () => {
    withPlatform('linux', () => {
      const env = { HOME: '/home/tester', XDG_CONFIG_HOME: '/home/tester/.config' }
      expect(configDir(env)).toBe(path.join('/home/tester/.config', 'everylist'))
    })
  })

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    withPlatform('linux', () => {
      expect(configDir({ HOME: '/home/tester' })).toBe(
        path.join('/home/tester', '.config', 'everylist')
      )
    })
  })

  it('falls back to the OS home when HOME is unset', () => {
    withPlatform('linux', () => {
      expect(configDir({})).toBe(path.join(os.homedir(), '.config', 'everylist'))
    })
  })

  it('uses the macOS Application Support path on darwin', () => {
    withPlatform('darwin', () => {
      expect(configDir({ HOME: '/Users/tester' })).toBe(
        path.join('/Users/tester', 'Library', 'Application Support', 'everylist')
      )
    })
  })

  it('uses %APPDATA% on win32, falling back to a default under the home dir', () => {
    withPlatform('win32', () => {
      expect(configDir({ APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' })).toBe(
        path.join('C:\\Users\\tester\\AppData\\Roaming', 'everylist')
      )
      expect(configDir({ HOME: 'C:\\Users\\tester' })).toBe(
        path.join('C:\\Users\\tester', 'AppData', 'Roaming', 'everylist')
      )
    })
  })
})

describe('readConfig / writeConfig', () => {
  it('round-trips baseUrl and token', () => {
    const dir = tmpDir()
    created.push(dir)
    const env = { EVERYLIST_CONFIG_DIR: dir }
    writeConfig({ baseUrl: 'https://x.example', token: 'elt_secret' }, env)
    expect(readConfig(env)).toEqual({ baseUrl: 'https://x.example', token: 'elt_secret' })
  })

  it('writes the file with 0600 permissions', () => {
    const dir = tmpDir()
    created.push(dir)
    const env = { EVERYLIST_CONFIG_DIR: dir }
    writeConfig({ token: 'elt_secret' }, env)
    const mode = fs.statSync(configPath(env)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('creates the config directory when absent', () => {
    const dir = tmpDir()
    created.push(dir)
    const nested = path.join(dir, 'deep', 'nested')
    const env = { EVERYLIST_CONFIG_DIR: nested }
    writeConfig({ token: 'elt_secret' }, env)
    expect(fs.existsSync(configPath(env))).toBe(true)
  })

  it('returns an empty object when the file is missing', () => {
    const dir = tmpDir()
    created.push(dir)
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir })).toEqual({})
  })

  it('returns an empty object when the file is malformed JSON', () => {
    const dir = tmpDir()
    created.push(dir)
    fs.writeFileSync(path.join(dir, 'config.json'), '{ not json')
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir })).toEqual({})
  })

  it('returns an empty object when the JSON is not an object', () => {
    const dir = tmpDir()
    created.push(dir)
    fs.writeFileSync(path.join(dir, 'config.json'), '"just a string"')
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir })).toEqual({})
  })

  it('ignores fields of the wrong type and empty strings', () => {
    const dir = tmpDir()
    created.push(dir)
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ baseUrl: 5, token: '', extra: true })
    )
    expect(readConfig({ EVERYLIST_CONFIG_DIR: dir })).toEqual({})
  })
})

describe('resolveBaseUrl / resolveToken', () => {
  it('prefers the env override over the config value', () => {
    const env = { EVERYLIST_URL: 'https://env.example', EVERYLIST_TOKEN: 'env-token' }
    expect(resolveBaseUrl({ baseUrl: 'https://config.example' }, env)).toBe('https://env.example')
    expect(resolveToken({ token: 'config-token' }, env)).toBe('env-token')
  })

  it('strips trailing slashes from the base URL', () => {
    expect(resolveBaseUrl({ baseUrl: 'https://x.example///' }, {})).toBe('https://x.example')
  })

  it('falls back to the config value when no env override exists', () => {
    expect(resolveBaseUrl({ baseUrl: 'https://config.example' }, {})).toBe('https://config.example')
    expect(resolveToken({ token: 'config-token' }, {})).toBe('config-token')
  })

  it('returns undefined when nothing is configured', () => {
    expect(resolveBaseUrl({}, {})).toBeUndefined()
    expect(resolveToken({}, {})).toBeUndefined()
  })
})

describe('maskToken', () => {
  it('keeps a recognizable prefix and suffix', () => {
    expect(maskToken('elt_abcdefghijklmnop')).toBe('elt_abc…mnop')
  })

  it('fully hides a token too short to mask safely', () => {
    expect(maskToken('elt_short')).toBe('••••')
  })
})

describe('requireBaseUrl', () => {
  it('returns the resolved URL when present', () => {
    expect(requireBaseUrl({ baseUrl: 'https://x.example' }, {})).toBe('https://x.example')
  })

  it('throws an AuthError-shaped CliError (code 3) when missing', () => {
    try {
      requireBaseUrl({}, {})
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).exitCode).toBe(3)
      expect((error as Error).message).toContain('No server URL configured')
    }
  })
})
