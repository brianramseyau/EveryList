#!/usr/bin/env node
/**
 * Prepares an Android-stream release: validates the What's-new entry and writes
 * apps/android/version.properties, the Android app's own version source.
 *
 * The Android app releases on its own cadence, independent of the server (`vX.Y.Z`) and iOS
 * (`ios-vX.Y.Z`) streams — foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md. This script is to
 * Android what scripts/prepare-release.mjs is to the server, and it touches nothing else in the
 * repo.
 *
 * Usage:
 *   1. On a branch:  pnpm prepare-android-release android-v1.8.1
 *      Commit, PR, merge.
 *   2. Tag the merge commit and push it:  git tag android-v1.8.1 && git push origin android-v1.8.1
 *      This triggers android-build.yml (AAB -> Play, plus the GitHub Release).
 *
 * Stable releases only (no "-rc"/"-beta" suffix) — pre-release builds override versionCode/Name in
 * CI (`-PappVersionCode`/`-PappVersionName`) and never publish to Play.
 *
 * versionCode must strictly increase release over release or Play rejects the upload as a
 * downgrade. This script derives it from the version (MAJOR*1e6 + MINOR*1e4 + PATCH*100 + 99) and
 * refuses to write a value that isn't greater than the one already in version.properties.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { extractWhatsNew, validateWhatsNew } from './android-whats-new.mjs'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const tag = process.argv[2]
if (!tag || !/^android-v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    'Usage: node scripts/prepare-android-release.mjs android-vX.Y.Z (stable releases only, no -rc/-beta suffix)'
  )
  process.exit(1)
}
const version = tag.slice('android-v'.length)

const changelogPath = path.join(repoRoot, 'apps/android/CHANGELOG.md')
const versionFilePath = path.join(repoRoot, 'apps/android/version.properties')

// Validate the Android changelog before touching version.properties, so a rejected run leaves
// nothing half-written. The newest `## vX.Y.Z` entry must match this Android version and carry a
// valid, truncated, plain-text What's new block — android-build.yml publishes it to Google Play.
try {
  const { version: entryVersion, text } = extractWhatsNew(readFileSync(changelogPath, 'utf8'))
  if (entryVersion !== version) {
    throw new Error(
      `its newest entry is v${entryVersion}, not v${version} — add the android-v${version} entry at the top`
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

// X.Y.Z -> X*1_000_000 + Y*10_000 + Z*100 + 99. The +99 leaves room for up to 98 `-rc.N` builds
// below the stable code (RC slot), matching the formula android-build.yml uses for pre-releases.
const [major, minor, patch] = version.split('.').map(Number)
const versionCode = major * 1_000_000 + minor * 10_000 + patch * 100 + 99

const previous = parseVersionProperties(readFileSync(versionFilePath, 'utf8'))
if (previous && versionCode <= previous.versionCode) {
  console.error(
    `Refusing to write ${tag}: its versionCode ${versionCode} is not greater than the current ` +
      `${previous.versionCode} (v${previous.versionName}). Play rejects a downgrade — pick a ` +
      'higher Android version.'
  )
  process.exit(1)
}

writeFileSync(
  versionFilePath,
  `# Android app version — the source of truth for versionCode/versionName.\n` +
    `#\n` +
    `# This is the Android release stream's own version, deliberately independent of the server\n` +
    `# (\`vX.Y.Z\`) and iOS (\`ios-vX.Y.Z\`) streams — see\n` +
    `# foundational/PLAN_35_PHASE_NATIVE_RELEASE_STREAMS.md. Written by\n` +
    `# scripts/prepare-android-release.mjs, which also asserts versionCode strictly increases\n` +
    `# (Play rejects a build whose versionCode isn't higher than the last one).\n` +
    `#\n` +
    `# app/build.gradle reads this as the default; CI overrides it with -P for \`android-vX.Y.Z-rc.N\`\n` +
    `# pre-release builds (an rc's code sits below its eventual stable code).\n` +
    `versionName=${version}\n` +
    `versionCode=${versionCode}\n`
)
console.log(`Updated apps/android/version.properties -> v${version} (versionCode ${versionCode})`)
console.log(
  `\nDone. Review the diff, then commit/PR/merge, tag the merge commit \`${tag}\`, and push it.`
)

/**
 * Minimal `version.properties` reader (key=value lines, `#` comments).
 *
 * @param {string} contents
 * @returns {{ versionName: string, versionCode: number } | null}
 */
function parseVersionProperties(contents) {
  const props = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  const versionCode = Number(props.versionCode)
  if (!props.versionName || !Number.isInteger(versionCode)) return null
  return { versionName: props.versionName, versionCode }
}
