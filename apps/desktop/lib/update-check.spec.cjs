'use strict'

const {
  parseVersion,
  isNewerVersion,
  selectLatestServerRelease,
  nextPageUrl,
  checkForUpdate
} = require('./update-check.cjs')

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

describe('selectLatestServerRelease', () => {
  const release = (over = {}) => ({
    tag_name: 'v1.0.0',
    html_url: 'https://example.com/releases/v1.0.0',
    ...over
  })

  it('returns null for a non-array body', () => {
    expect(selectLatestServerRelease(null)).toBeNull()
    expect(selectLatestServerRelease({ tag_name: 'v1.0.0' })).toBeNull()
  })

  it('returns null when there are no server releases', () => {
    expect(selectLatestServerRelease([])).toBeNull()
  })

  it('ignores native-stream tags (android-/ios-) even when newer', () => {
    const result = selectLatestServerRelease([
      release({ tag_name: 'android-v9.9.9', html_url: 'https://example.com/a' }),
      release({ tag_name: 'ios-v9.9.9', html_url: 'https://example.com/i' }),
      release({ tag_name: 'v1.2.3', html_url: 'https://example.com/s' })
    ])
    expect(result).toEqual({ tag: 'v1.2.3', url: 'https://example.com/s' })
  })

  it('ignores prereleases and drafts', () => {
    const result = selectLatestServerRelease([
      release({ tag_name: 'v9.9.9', prerelease: true }),
      release({ tag_name: 'v9.9.8', draft: true }),
      release({ tag_name: 'v1.2.3', html_url: 'https://example.com/s' })
    ])
    expect(result).toEqual({ tag: 'v1.2.3', url: 'https://example.com/s' })
  })

  it('picks the highest server release regardless of list order', () => {
    const result = selectLatestServerRelease([
      release({ tag_name: 'v1.2.3', html_url: 'https://example.com/123' }),
      release({ tag_name: 'v1.10.0', html_url: 'https://example.com/110' }),
      release({ tag_name: 'v1.9.0', html_url: 'https://example.com/190' })
    ])
    expect(result).toEqual({ tag: 'v1.10.0', url: 'https://example.com/110' })
  })

  it('skips malformed entries', () => {
    const result = selectLatestServerRelease([
      null,
      'not-an-object',
      { tag_name: 'v2.0.0' },
      release({ tag_name: 'v1.2.3', html_url: 'https://example.com/s' })
    ])
    expect(result).toEqual({ tag: 'v1.2.3', url: 'https://example.com/s' })
  })
})

describe('nextPageUrl', () => {
  it('extracts the rel="next" URL', () => {
    expect(
      nextPageUrl({
        ok: true,
        headers: {
          get: (name) =>
            name === 'link'
              ? '<https://api.github.com/repos/o/r/releases?page=2>; rel="next", <https://api.github.com/repos/o/r/releases?page=5>; rel="last"'
              : null
        },
        json: async () => []
      })
    ).toBe('https://api.github.com/repos/o/r/releases?page=2')
  })

  it('returns null when there is no Link header', () => {
    expect(nextPageUrl({ ok: true, json: async () => [] })).toBeNull()
  })

  it('returns null when the Link header has no rel="next"', () => {
    expect(
      nextPageUrl({
        ok: true,
        headers: { get: () => '<https://api.github.com/x?page=1>; rel="prev"' },
        json: async () => []
      })
    ).toBeNull()
  })
})

describe('checkForUpdate', () => {
  /**
   * A one-page response (no Link header), so pagination stops after the first call.
   *
   * @param {unknown[]} releases
   * @returns {() => Promise<{ ok: boolean, json: () => Promise<unknown> }>}
   */
  const listResponse = (releases) => async () => ({
    ok: true,
    json: async () => releases
  })

  /**
   * A paged fetch: `pages` is keyed by the `page` query param (absent = page 1). Each response's
   * Link header points at the next page while one remains.
   *
   * @param {Record<string, unknown[]>} pages
   * @returns {(url: string) => Promise<{ ok: boolean, headers: { get: (n: string) => string | null }, json: () => Promise<unknown> }>}
   */
  const pagedFetch = (pages) => async (url) => {
    const page = new URL(url).searchParams.get('page') ?? '1'
    const nextPage = String(Number(page) + 1)
    const more = Object.prototype.hasOwnProperty.call(pages, nextPage)
    return {
      ok: true,
      headers: {
        get: (name) =>
          name === 'link' && more
            ? `<https://api.github.com/repos/o/r/releases?page=${nextPage}>; rel="next"`
            : null
      },
      json: async () => pages[page]
    }
  }

  it('reports an available update when the latest server release is newer', async () => {
    const fetchImpl = listResponse([
      {
        tag_name: 'v9.9.9',
        html_url: 'https://example.com/releases/v9.9.9',
        prerelease: false,
        draft: false
      }
    ])
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({
      status: 'update-available',
      latestVersion: 'v9.9.9',
      url: 'https://example.com/releases/v9.9.9'
    })
  })

  it('does not offer a newer Android release as a desktop update', async () => {
    const fetchImpl = listResponse([
      { tag_name: 'android-v99.0.0', html_url: 'https://example.com/android', prerelease: false },
      { tag_name: 'v1.0.0', html_url: 'https://example.com/v1.0.0', prerelease: false }
    ])
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({ status: 'up-to-date' })
  })

  it('reports up-to-date when the latest server release is not newer', async () => {
    const fetchImpl = listResponse([
      { tag_name: 'v1.0.0', html_url: 'https://example.com/releases/v1.0.0' }
    ])
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

  it('reports an error when the body is not an array', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ tag_name: 'v1.0.0' }) })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports up-to-date when no server release exists', async () => {
    const fetchImpl = listResponse([
      { tag_name: 'android-v1.0.0', html_url: 'https://example.com' }
    ])
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({ status: 'up-to-date' })
  })

  it('follows pagination and finds a server release on a later page', async () => {
    // Page 1 is entirely native/prerelease noise; the server update is on page 2.
    const fetchImpl = pagedFetch({
      1: [
        { tag_name: 'android-v99.0.0', html_url: 'https://example.com/a' },
        { tag_name: 'ios-v99.0.0', html_url: 'https://example.com/i' },
        { tag_name: 'v9.9.9', html_url: 'https://example.com/pre', prerelease: true }
      ],
      2: [
        { tag_name: 'v1.5.0', html_url: 'https://example.com/s', prerelease: false, draft: false }
      ]
    })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result).toEqual({
      status: 'update-available',
      latestVersion: 'v1.5.0',
      url: 'https://example.com/s'
    })
  })

  it('reports an error when pagination never terminates (cap reached with more pages left)', async () => {
    // Always advertises another page, so the loop hits MAX_RELEASE_PAGES with `next` still set.
    const fetchImpl = async () => ({
      ok: true,
      headers: { get: () => '<https://api.github.com/repos/o/r/releases?page=2>; rel="next"' },
      json: async () => [{ tag_name: 'android-v1.0.0', html_url: 'https://example.com' }]
    })
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('reports an error when a later page fails', async () => {
    let call = 0
    const fetchImpl = async () => {
      call += 1
      if (call === 1) {
        return {
          ok: true,
          headers: { get: () => '<https://api.github.com/repos/o/r/releases?page=2>; rel="next"' },
          json: async () => [{ tag_name: 'android-v1.0.0', html_url: 'https://example.com' }]
        }
      }
      return { ok: false, json: async () => ({}) }
    }
    const result = await checkForUpdate('v1.0.0', { fetchImpl })
    expect(result.status).toBe('error')
  })

  it('uses the real global fetch and default owner/repo when not overridden', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = /** @type {any} */ (
      async () => ({
        ok: true,
        json: async () => [{ tag_name: 'v1.0.0', html_url: 'https://example.com' }]
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
