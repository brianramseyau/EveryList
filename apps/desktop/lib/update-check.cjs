'use strict'

const REPO_OWNER = 'brianramseyau'
const REPO_NAME = 'EveryList'

/**
 * Tags belonging to the **server/web/desktop** release stream — a leading `v` and nothing else
 * (`v1.8.0`). Deliberately excludes the native streams' prefixed tags (`android-v1.8.1`,
 * `ios-v1.8.1`) and any prerelease suffix (`v1.8.1-rc.1`), so the desktop app never offers an
 * Android/iOS build or a test build as an update. See
 * foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md.
 */
const SERVER_TAG_PATTERN = /^v\d+\.\d+\.\d+$/

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
 * @typedef {{ tag_name?: unknown, html_url?: unknown, draft?: unknown, prerelease?: unknown }} ReleaseLike
 */

/**
 * Picks the highest server-stream release from GitHub's releases list.
 *
 * Desktop's update check used to read `releases/latest`, which returns whichever stream released
 * most recently *by date* — once `android-v…`/`ios-v…` releases exist that could be an Android
 * build, and the app would offer an AAB as a desktop update. It now scans the list and ignores
 * anything that isn't a plain `vX.Y.Z` server release (native-prefixed tags, prereleases, drafts).
 *
 * @param {unknown} releases
 * @returns {{ tag: string, url: string } | null}
 */
function selectLatestServerRelease(releases) {
  if (!Array.isArray(releases)) return null

  let best = null
  for (const release of releases) {
    if (!release || typeof release !== 'object') continue
    const { tag_name: tag, html_url: url, draft, prerelease } = /** @type {ReleaseLike} */ (release)
    if (draft === true || prerelease === true) continue
    if (typeof tag !== 'string' || !SERVER_TAG_PATTERN.test(tag)) continue
    if (typeof url !== 'string') continue
    if (best === null) {
      best = { tag, url }
    } else if (isNewerVersion(tag, best.tag)) {
      best = { tag, url }
    }
  }
  return best
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
    // The list endpoint, not `/releases/latest`: see selectLatestServerRelease. 100 is GitHub's max
    // page size and comfortably covers the recency window the newest server release sits in.
    response = await fetchImpl(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
      {
        headers: { Accept: 'application/vnd.github+json' }
      }
    )
  } catch {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  }

  if (response.ok === false) {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  } else {
    /** @type {unknown} */
    let data
    try {
      data = await response.json()
    } catch {
      return { status: 'error', message: CHECK_FAILED_MESSAGE }
    }

    // A non-array body means an unexpected/error shape, not "no releases" — treat it as a failure.
    if (!Array.isArray(data)) {
      return { status: 'error', message: CHECK_FAILED_MESSAGE }
    } else {
      const latest = selectLatestServerRelease(data)
      if (!latest) {
        // No server release to point at (e.g. a fresh fork with only native tags) — nothing to
        // update to.
        return { status: 'up-to-date' }
      } else if (isNewerVersion(latest.tag, currentVersion)) {
        return { status: 'update-available', latestVersion: latest.tag, url: latest.url }
      }
      return { status: 'up-to-date' }
    }
  }
}

module.exports = { parseVersion, isNewerVersion, selectLatestServerRelease, checkForUpdate }
