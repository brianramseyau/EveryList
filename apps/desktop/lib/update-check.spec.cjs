'use strict'

const { parseVersion, isNewerVersion, checkForUpdate } = require('./update-check.cjs')

describe('parseVersion', () => {
  it('parses a bare semver', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses a v-prefixed tag with a suffix', () => {
    expect(parseVersion('v1.2.3-rc.1')).toEqual([1, 2, 3])
  })

  it('returns null for an unparseable value', () => {
    expect(parseVersion('not-a-version')).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('is true when latest is greater', () => {
    expect(isNewerVersion('v1.3.0', 'v1.2.9')).toBe(true)
  })

  it('is false when equal', () => {
    expect(isNewerVersion('v1.2.3', 'v1.2.3')).toBe(false)
  })

  it('is false when latest is older', () => {
    expect(isNewerVersion('v1.0.0', 'v1.2.3')).toBe(false)
  })

  it('compares minor/patch correctly when major is equal', () => {
    expect(isNewerVersion('v1.2.4', 'v1.2.3')).toBe(true)
    expect(isNewerVersion('v1.3.0', 'v1.2.9')).toBe(true)
  })

  it('is false when either version is unparseable', () => {
    expect(isNewerVersion('nope', 'v1.0.0')).toBe(false)
    expect(isNewerVersion('v1.0.0', 'nope')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('reports an available update when the latest release is newer', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v9.9.9', html_url: 'https://example.com/releases/v9.9.9' })
    })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({
      status: 'update-available',
      latestVersion: 'v9.9.9',
      url: 'https://example.com/releases/v9.9.9'
    })
  })

  it('reports up-to-date when the latest release is not newer', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v1.0.0', html_url: 'https://example.com/releases/v1.0.0' })
    })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({ status: 'up-to-date' })
  })

  it('reports an error when the network request throws', async () => {
    const fetchImpl = async () => {
      throw new Error('offline')
    }
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports an error on a non-OK response (e.g. rate limited)', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports an error when the body is not valid JSON', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad body')
      }
    })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports an error when the response is missing tag_name/html_url', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({}) })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports an error when the body parses to null', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => null })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('uses the real global fetch and default owner/repo when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (
      async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v1.0.0', html_url: 'https://example.com' })
      })
    )
    try {
      const result = await checkForUpdate('v1.0.0')
      expect(result).toEqual({ status: 'up-to-date' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
