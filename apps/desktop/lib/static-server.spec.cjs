'use strict'

const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { createStaticServer, listen } = require('./static-server.cjs')

/**
 * @param {string} url
 * @returns {Promise<{ status: number, body: string, contentType: string | undefined }>}
 */
function get(url) {
  return new Promise((resolvePromise, reject) => {
    http
      .get(url, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body,
            contentType: res.headers['content-type']
          })
        })
      })
      .on('error', reject)
  })
}

describe('static server', () => {
  /** @type {string} */
  let buildRoot
  /** @type {import('node:http').Server} */
  let server
  /** @type {string} */
  let baseUrl

  beforeAll(async () => {
    buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'everylist-desktop-server-'))
    fs.writeFileSync(path.join(buildRoot, 'index.html'), '<html>root</html>')
    fs.writeFileSync(path.join(buildRoot, '200.html'), '<html>fallback</html>')

    server = createStaticServer(buildRoot)
    await listen(server, 0)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('expected a bound TCP address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(() => {
    server.close()
    fs.rmSync(buildRoot, { recursive: true, force: true })
  })

  it('serves a found file with a 200 and the right content type', async () => {
    const response = await get(`${baseUrl}/`)
    expect(response.status).toBe(200)
    expect(response.contentType).toBe('text/html; charset=utf-8')
    expect(response.body).toBe('<html>root</html>')
  })

  it('serves the SPA fallback for an unknown route', async () => {
    const response = await get(`${baseUrl}/lists/5`)
    expect(response.status).toBe(200)
    expect(response.body).toBe('<html>fallback</html>')
  })

  it('rejects a raw traversal request line the resolver would 403', async () => {
    const response = await new Promise((resolvePromise, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: Number(baseUrl.split(':')[2]),
          path: '/%2e%2e/%2e%2e/etc/passwd'
        },
        (res) => {
          res.on('data', () => {})
          res.on('end', () => resolvePromise({ status: res.statusCode }))
        }
      )
      req.on('error', reject)
      req.end()
    })
    expect(response.status).toBe(403)
  })

  it('rejects with the correct code when listen fails (port already in use)', async () => {
    const blocker = createStaticServer(buildRoot)
    await listen(blocker, 0)
    const address = blocker.address()
    if (!address || typeof address === 'string') throw new Error('expected a bound TCP address')

    const conflicting = createStaticServer(buildRoot)
    await expect(listen(conflicting, address.port)).rejects.toThrow()

    blocker.close()
  })
})
