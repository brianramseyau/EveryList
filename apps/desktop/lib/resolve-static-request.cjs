'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { contentTypeForPath } = require('./mime.cjs')

/**
 * Maps an incoming request path to a file under `buildRoot`, in the order specified by
 * PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §2:
 *   1. an exact file under the build root;
 *   2. `<path>/index.html`, if it exists (adapter-static's prerendered-route shape);
 *   3. `200.html` — never `index.html`, which is the real prerendered `/` page and runs its
 *      own redirect logic (see PLAN_13_PHASE_NATIVE_APP_SHELL.md §4's Capacitor fallback bug).
 * Rejects any request path that resolves outside `buildRoot` (path traversal) — this server is
 * loopback-only, but it is still a server.
 *
 * @param {string} buildRoot
 * @param {string} requestPath
 * @returns {{ status: 200, filePath: string, contentType: string } | { status: 400 | 403 | 404 }}
 */
function resolveStaticRequest(buildRoot, requestPath) {
  const resolvedRoot = path.resolve(buildRoot)
  const withoutQuery = requestPath.replace(/\?.*$/s, '')

  let decoded
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    return { status: 400 }
  }

  const relative = decoded.replace(/^\/+/, '')
  const candidate = path.resolve(resolvedRoot, relative)
  const isWithinRoot = candidate === resolvedRoot || candidate.startsWith(resolvedRoot + path.sep)
  if (!isWithinRoot) {
    return { status: 403 }
  }

  if (relative !== '' && isFile(candidate)) {
    return { status: 200, filePath: candidate, contentType: contentTypeForPath(candidate) }
  }

  const indexCandidate = path.join(candidate, 'index.html')
  if (isFile(indexCandidate)) {
    return { status: 200, filePath: indexCandidate, contentType: 'text/html; charset=utf-8' }
  }

  const fallback = path.join(resolvedRoot, '200.html')
  if (isFile(fallback)) {
    return { status: 200, filePath: fallback, contentType: 'text/html; charset=utf-8' }
  }

  return { status: 404 }
}

/** @param {string} candidate */
function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

module.exports = { resolveStaticRequest }
