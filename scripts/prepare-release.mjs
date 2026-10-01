#!/usr/bin/env node
/**
 * Updates workspace package.json "version" fields for a release in one place: the client
 * workspaces move with the release tag, and the API's own version moves only when the API
 * changed (see below), so the two can legitimately differ.
 *
 * Deliberately does NOT touch ha-addon/everylist/config.yaml: that version is the exact GHCR
 * image tag Supervisor pulls, so it may only move *after* the release image is published. It has
 * its own script, scripts/release-addon.mjs (`pnpm release-addon`), run as the last step.
 *
 * Release order:
 *   1. On a release branch (not main):  pnpm prepare-release v1.6.2
 *      Commit, open a PR, merge it like any other change.
 *   2. Tag the merge commit and push the tag - triggers docker-publish.yml and native-build.yml:
 *      git tag v1.6.2 && git push origin v1.6.2
 *   3. Once docker-publish.yml has finished:  pnpm release-addon v1.6.2  (see that script)
 *
 * Bump before tagging so the tagged commit carries the right versions. Nothing in CI requires it
 * (Docker takes its version from the tag, and native-build.yml injects the tag's version into
 * apps/desktop before packaging), but two version groups are real:
 *
 *   - "Release-synced" workspaces (root, apps/web, apps/desktop, apps/cli) always move to the new
 *     tag. apps/desktop's names the built DMG/EXE/AppImage; apps/cli's is what `everylist
 *     --version` reports; the rest are metadata.
 *   - apps/api + packages/shared are the API's own version, and only move when the API (or the
 *     shared DTOs it compiles against) changed since the last stable tag. `apps/api/package.json`
 *     feeds the OpenAPI document's `info.version` and the MCP `serverInfo.version`
 *     (config/openapi.ts, config/mcp.ts); leaving it put means `/docs` truthfully names the last
 *     release whose API surface moved. See foundational/PLAN_34_PHASE_API_VERSIONING.md.
 * Don't blank these to 0.0.0.
 *
 * Stable releases only (no "-rc"/"-beta" suffix).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { extractWhatsNew, validateWhatsNew } from './android-whats-new.mjs'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    'Usage: node scripts/prepare-release.mjs vX.Y.Z (stable releases only, no -rc/-beta suffix)'
  )
  process.exit(1)
}
const bareVersion = tag.slice(1)

// Guard before touching any file: the release branch must already carry an apps/android/CHANGELOG.md
// entry for this version, with a valid truncated What's new block (native-build.yml publishes it to
// Google Play — see scripts/android-whats-new.mjs). Failing here rather than after the package.json
// rewrite keeps a rejected run from leaving the versions half-bumped.
const changelogPath = path.join(repoRoot, 'apps/android/CHANGELOG.md')
try {
  const { version, text } = extractWhatsNew(readFileSync(changelogPath, 'utf8'))
  if (version !== bareVersion) {
    throw new Error(
      `its newest entry is v${version}, not v${bareVersion} — add the v${bareVersion} entry at the top`
    )
  }
  validateWhatsNew(text)
} catch (error) {
  console.error(
    `apps/android/CHANGELOG.md isn't ready for ${tag}: ${error instanceof Error ? error.message : String(error)}\n` +
      'Add the release entry (a `## vX.Y.Z` heading + a `<!-- whats-new:start -->`/`end` truncated ' +
      "summary under 500 chars) and run this again — it feeds the Google Play What's new text."
  )
  process.exit(1)
}

// Every workspace's package.json "version" field - npm/electron-builder want a bare semver,
// no "v" prefix. apps/desktop's names the built DMG/EXE/AppImage and apps/cli's is what
// `everylist --version` reports (apps/cli/src/version.ts reads its own package.json). Regex-
// replaced in place (not JSON.parse/stringify) so each file's existing formatting -
// apps/web/package.json is tab-indented, the rest are 2-space - survives untouched.
const versionField = /"version":\s*"[^"]*"/

function setVersion(relPath, value) {
  const filePath = path.join(repoRoot, relPath)
  const contents = readFileSync(filePath, 'utf8')
  if (!versionField.test(contents)) {
    console.error(`Could not find a "version" field in ${filePath}`)
    process.exit(1)
  }
  writeFileSync(filePath, contents.replace(versionField, `"version": "${value}"`))
}

// Always follow the release train, whatever changed.
const releaseSyncedPaths = [
  'package.json',
  'apps/web/package.json',
  'apps/desktop/package.json',
  'apps/cli/package.json'
]
for (const relPath of releaseSyncedPaths) {
  setVersion(relPath, bareVersion)
  console.log(`Updated ${relPath} -> ${bareVersion}`)
}

// The API's own version (apps/api + the shared DTOs it compiles against) only moves when the
// API changed since the last stable release. Both are set together: apps/api depends on
// packages/shared, so a shared DTO change is an API change even if no apps/api file was touched.
const lastStableTag = findLastStableTag()
const apiChanged = lastStableTag
  ? pathsChangedSince(lastStableTag, ['apps/api', 'packages/shared'])
  : true
if (apiChanged) {
  setVersion('apps/api/package.json', bareVersion)
  setVersion('packages/shared/package.json', bareVersion)
  console.log(
    `Updated apps/api/package.json and packages/shared/package.json -> ${bareVersion} ` +
      `(API changed since ${lastStableTag ?? 'the start of history'})`
  )
} else {
  console.log(
    'Left apps/api/package.json and packages/shared/package.json unchanged (no apps/api or ' +
      `packages/shared changes since ${lastStableTag}) — /docs keeps naming the last release ` +
      'whose API moved.'
  )
}

console.log(
  `\nDone. Review the diff, then commit/PR/merge, tag the merge commit, and (after docker-publish.yml finishes) run \`pnpm release-addon ${tag}\`.`
)

/**
 * The newest stable (non-pre-release) `vX.Y.Z` tag reachable from HEAD, or null when there is
 * none yet. `--exclude` only filters patterns that are also matched, so `--match 'v*'` is
 * required for the rc exclusion to apply.
 */
function findLastStableTag() {
  try {
    return (
      execFileSync(
        'git',
        ['describe', '--tags', '--abbrev=0', '--match', 'v*', '--exclude', '*-rc.*'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim() || null
    )
  } catch {
    // `git describe` exits non-zero when no tag matches (e.g. a fresh clone with no tags).
    return null
  }
}

/** Whether any file under `roots` changed between `fromTag` and HEAD. */
function pathsChangedSince(fromTag, roots) {
  const output = execFileSync('git', ['diff', '--name-only', `${fromTag}..HEAD`, '--', ...roots], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  return output.trim().length > 0
}
