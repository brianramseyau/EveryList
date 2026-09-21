#!/usr/bin/env node
/**
 * Updates every workspace package.json "version" for a release in one place, so they can't
 * drift out of sync with each other or with the release tag being cut.
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
 * apps/desktop before packaging), but apps/api's version is real: config/openapi.ts reads it for
 * the OpenAPI document's info.version (/docs, /openapi). Don't blank these to 0.0.0.
 *
 * Stable releases only (no "-rc"/"-beta" suffix).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    'Usage: node scripts/prepare-release.mjs vX.Y.Z (stable releases only, no -rc/-beta suffix)'
  )
  process.exit(1)
}
const bareVersion = tag.slice(1)

// Every workspace's package.json "version" field - npm/electron-builder want a bare semver,
// no "v" prefix. apps/desktop's is the one that actually matters functionally (it names the
// built DMG/EXE/AppImage); the rest are otherwise-unused metadata, kept in sync for hygiene.
// Regex-replaced in place (not JSON.parse/stringify) so each file's existing formatting -
// apps/web/package.json is tab-indented, the rest are 2-space - survives untouched.
const packageJsonPaths = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/desktop/package.json',
  'packages/shared/package.json'
]
const versionField = /"version":\s*"[^"]*"/
for (const relPath of packageJsonPaths) {
  const filePath = path.join(repoRoot, relPath)
  const contents = readFileSync(filePath, 'utf8')
  if (!versionField.test(contents)) {
    console.error(`Could not find a "version" field in ${filePath}`)
    process.exit(1)
  }
  writeFileSync(filePath, contents.replace(versionField, `"version": "${bareVersion}"`))
  console.log(`Updated ${relPath} -> ${bareVersion}`)
}

console.log(
  `\nDone. Review the diff, then commit/PR/merge, tag the merge commit, and (after docker-publish.yml finishes) run \`pnpm release-addon ${tag}\`.`
)
