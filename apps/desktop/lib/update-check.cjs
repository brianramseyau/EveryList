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
 * @typedef {{ get?: (name: string) => string | null }} MinimalHeaders
 * @typedef {{ ok: boolean, headers?: MinimalHeaders, json: () => Promise<unknown> }} MinimalResponse
 * @typedef {(url: string, init?: RequestInit) => Promise<MinimalResponse>} MinimalFetch
 */

/**
 * Safety valve on pagination: stop after this many pages even if GitHub keeps advertising a
 * `next` link. At 100/page that's 5000 releases — far more than this repo will ever have, and it
 * bounds the worst case (and guards against a malformed/mocked response that always says "next").
 */
const MAX_RELEASE_PAGES = 50

/**
 * Extracts the `rel="next"` URL from a `Link` response header, or null when there is none.
 *
 * @param {MinimalResponse} response
 * @returns {string | null}
 */
function nextPageUrl(response) {
  const link = response.headers?.get?.('link')
  if (typeof link !== 'string') return null
  const match = /<([^>]+)>;\s*rel="next"/.exec(link)
  return match?.[1] ?? null
}

/**
 * Fetches every page of the repo's releases, following GitHub's `Link: rel="next"` pagination.
 * Returns the flattened list, or null on any failure — network error, non-OK response,
 * unparseable body, or an unexpected non-array shape. A failure on *any* page (not just the
 * first) is reported as an error rather than silently truncated, so a newer server release can't
 * be missed because a later page failed.
 *
 * @param {MinimalFetch} fetchImpl
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<unknown[] | null>}
 */
async function fetchAllReleases(fetchImpl, owner, repo) {
  /** @type {unknown[]} */
  const releases = []
  /** @type {string | null} */
  let url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`

  for (let page = 0; page < MAX_RELEASE_PAGES && url !== null; page++) {
    const pageUrl = url
    /** @type {MinimalResponse} */
    let response
    try {
      response = await fetchImpl(pageUrl, { headers: { Accept: 'application/vnd.github+json' } })
    } catch {
      return null
    }

    if (response.ok === false) {
      return null
    } else {
      /** @type {unknown} */
      let data
      try {
        data = await response.json()
      } catch {
        return null
      }

      // A non-array body means an unexpected/error shape, not "no releases".
      if (!Array.isArray(data)) {
        return null
      } else {
        releases.push(...data)
        url = nextPageUrl(response)
      }
    }
  }

  // Hitting the cap while `next` still points somewhere means the scan is incomplete — return null
  // (→ the friendly error) rather than a partial list a newer server release could be missing from.
  return url === null ? releases : null
}

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

  // The list endpoint, not `/releases/latest`: see selectLatestServerRelease. Every page is
  // followed — native-stream releases (`android-v…`/`ios-v…`) and prereleases can fill a page, so
  // the newest server release may not be on the first one.
  const releases = await fetchAllReleases(fetchImpl, owner, repo)
  if (releases === null) {
    return { status: 'error', message: CHECK_FAILED_MESSAGE }
  } else {
    const latest = selectLatestServerRelease(releases)
    if (!latest) {
      // No server release to point at (e.g. a fresh fork with only native tags) — nothing to update.
      return { status: 'up-to-date' }
    } else if (isNewerVersion(latest.tag, currentVersion)) {
      return { status: 'update-available', latestVersion: latest.tag, url: latest.url }
    }
    return { status: 'up-to-date' }
  }
}

module.exports = {
  parseVersion,
  isNewerVersion,
  selectLatestServerRelease,
  nextPageUrl,
  checkForUpdate
}
