'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveStaticRequest } = require('./resolve-static-request.cjs')

describe('resolveStaticRequest', () => {
  /** @type {string} */
  let buildRoot

  beforeAll(() => {
    buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-static-'))
    fs.writeFileSync(path.join(buildRoot, 'index.html'), '<html>root</html>')
    fs.writeFileSync(path.join(buildRoot, '200.html'), '<html>fallback</html>')
    fs.mkdirSync(path.join(buildRoot, '_app'))
    fs.writeFileSync(path.join(buildRoot, '_app', 'start.js'), 'console.log(1)')
    fs.mkdirSync(path.join(buildRoot, 'settings', 'sync'), { recursive: true })
    fs.writeFileSync(path.join(buildRoot, 'settings', 'sync', 'index.html'), '<html>sync</html>')
  })

  afterAll(() => {
    fs.rmSync(buildRoot, { recursive: true, force: true })
  })

  it('serves an exact file with the right content type', () => {
    const result = resolveStaticRequest(buildRoot, '/_app/start.js')
    expect(result).toEqual({
      status: 200,
      filePath: path.join(buildRoot, '_app', 'start.js'),
      contentType: 'text/javascript; charset=utf-8'
    })
  })

  it('decodes percent-encoded request paths', () => {
    const result = resolveStaticRequest(buildRoot, '/_app/start.js?x=%20')
    expect(result.status).toBe(200)
  })

  it('serves the prerendered index.html for a route directory that has one', () => {
    const result = resolveStaticRequest(buildRoot, '/settings/sync')
    expect(result).toEqual({
      status: 200,
      filePath: path.join(buildRoot, 'settings', 'sync', 'index.html'),
      contentType: 'text/html; charset=utf-8'
    })
  })

  it('serves the root index.html for /', () => {
    const result = resolveStaticRequest(buildRoot, '/')
    expect(result).toEqual({
      status: 200,
      filePath: path.join(buildRoot, 'index.html'),
      contentType: 'text/html; charset=utf-8'
    })
  })

  it('falls back to 200.html for an unknown deep route (SPA fallback)', () => {
    const result = resolveStaticRequest(buildRoot, '/lists/5')
    expect(result).toEqual({
      status: 200,
      filePath: path.join(buildRoot, '200.html'),
      contentType: 'text/html; charset=utf-8'
    })
  })

  it('returns 404 when even the 200.html fallback is missing', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-static-empty-'))
    try {
      expect(resolveStaticRequest(emptyRoot, '/anything')).toEqual({ status: 404 })
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true })
    }
  })

  it('rejects path traversal that would escape the build root', () => {
    expect(resolveStaticRequest(buildRoot, '/../../etc/passwd')).toEqual({ status: 403 })
    expect(resolveStaticRequest(buildRoot, '/%2e%2e/%2e%2e/etc/passwd')).toEqual({ status: 403 })
  })

  it('rejects an unparseable percent-encoded request path', () => {
    expect(resolveStaticRequest(buildRoot, '/%')).toEqual({ status: 400 })
  })
})
