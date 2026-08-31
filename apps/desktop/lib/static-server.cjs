'use strict'

const http = require('node:http')
const fs = require('node:fs')
const { resolveStaticRequest } = require('./resolve-static-request.cjs')

/**
 * An in-process HTTP static server bound to a loopback host, serving `buildRoot` — see
 * PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §2 for why this exists instead of `file://` or a random
 * port. No dependency beyond Node's own `http`/`fs`.
 *
 * @param {string} buildRoot
 * @returns {import('node:http').Server}
 */
function createStaticServer(buildRoot) {
  return http.createServer((req, res) => {
    // req.url is undefined only for a CONNECT request, which Node never delivers to a plain
    // HTTP server's request handler — untestable without faking the http module itself.
    /* v8 ignore next */
    const result = resolveStaticRequest(buildRoot, req.url ?? '/')
    if (result.status !== 200) {
      res.writeHead(result.status)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': result.contentType })
    const stream = fs.createReadStream(result.filePath)
    // A read failure after the file passed resolveStaticRequest's own check (removed mid-request,
    // a permission error, etc.) — without this listener, `fs.createReadStream` emits 'error' on
    // the stream, which Node treats as unhandled and crashes the whole Electron main process.
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  })
}

/**
 * @param {import('node:http').Server} server
 * @param {number} port
 * @param {string} [host]
 * @returns {Promise<void>}
 */
function listen(server, port, host = '127.0.0.1') {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.removeListener('error', reject)
      resolvePromise()
    })
  })
}

module.exports = { createStaticServer, listen }
