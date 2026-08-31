'use strict'

const REPO_OWNER = 'brianramseyau'
const REPO_NAME = 'EveryList'

/**
 * @param {string} value
 * @returns {[number, number, number] | null}
 */
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value).trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * @param {string} latest
 * @param {string} current
 * @returns {boolean}
 */
function isNewerVersion(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  const [aMajor, aMinor, aPatch] = a
  const [bMajor, bMinor, bPatch] = b
  if (aMajor !== bMajor) return aMajor > bMajor
  if (aMinor !== bMinor) return aMinor > bMinor
  return aPatch > bPatch
}

/**
 * @typedef {{ status: 'update-available', latestVersion: string, url: string }
 *   | { status: 'up-to-date' }
 *   | { status: 'error', message: string }} UpdateCheckResult
 */

const CHECK_FAILED_MESSAGE = "Couldn't check for updates right now."

/**
 * @typedef {(url: string, init?: RequestInit) => Promise<{ ok: boolean, json: () => Promise<unknown> }>} MinimalFetch
 */

/**
 * "Check and link", not `electron-updater` (PLAN_22_PHASE_DESKTOP_APP_ELECTRON.md §8 — unsigned
 * macOS builds cannot auto-update at all). Every failure mode — network error, a non-OK
 * response, an unparseable body, rate limiting — reports the same friendly error rather than
 * throwing, since this runs from a UI button with no crash-worthy consequence.
 *
 * @param {string} currentVersion
 * @param {{ fetchImpl?: MinimalFetch, owner?: string, repo?: string }} [options]
 * @returns {Promise<UpdateCheckResult>}
 */
async function checkForUpdate(currentVersion, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const owner = options.owner ?? REPO_OWNER
  const repo = options.repo ?? REPO_NAME

  let response
  try {
    response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
  } catch {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  }

  if (response.ok === false) {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  }

  /** @type {{ tag_name?: unknown, html_url?: unknown } | null} */
  let data
  try {
    data = /** @type {{ tag_name?: unknown, html_url?: unknown } | null} */ (await response.json())
  } catch {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  }

  const tag = data && typeof data === 'object' ? data.tag_name : undefined
  const url = data && typeof data === 'object' ? data.html_url : undefined
  if (typeof tag !== 'string' || typeof url !== 'string') {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  }

  if (isNewerVersion(tag, currentVersion)) {
    return { status: 'update-available', latestVersion: tag, url }
  }
  return { status: 'up-to-date' }
}

module.exports = { parseVersion, isNewerVersion, checkForUpdate }
