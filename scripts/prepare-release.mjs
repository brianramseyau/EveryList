#!/usr/bin/env node
/**
 * Updates every version marker for a release in one place, so
 * ha-addon/everylist/config.yaml and each workspace's package.json can't
 * drift out of sync with each other or with the release tag being cut.
 *
 * This replaces an earlier attempt to bump ha-addon/everylist/config.yaml
 * from CI on every stable tag (see .github/workflows/docker-publish.yml's
 * comment) - that job pushed straight to main, which main's pull_request-only
 * required status checks always reject, and routing it through a bot-authored
 * PR instead doesn't work either (GitHub suppresses the `pull_request` event
 * for anything created with the workflow's own GITHUB_TOKEN, so those checks
 * would never run and auto-merge would sit pending forever). A local script
 * run once per release, committed through the normal branch/PR flow, sidesteps
 * all of that.
 *
 * Usage:
 *   git tag v1.5.0 && git push origin v1.5.0   # first - triggers docker-publish.yml
 *   # wait for that to finish, then, on a release branch (not main):
 *   node scripts/prepare-release.mjs v1.5.0
 *
 * Tag first, script second - deliberately. ha-addon/everylist/config.yaml's `version` is the
 * exact GHCR image tag Supervisor will pull, so it must never land on `main` ahead of that
 * image actually existing; bumping it only after `docker-publish.yml` has published the tag
 * closes that gap. Review the script's diff, then commit, push, open a PR, and merge it like
 * any other change.
 *
 * Stable releases only (no "-rc"/"-beta" suffix) - a prerelease tag is never what
 * config.yaml's `version` should point every add-on user's instance at.
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

// Supervisor pulls this value verbatim as the Docker image tag to install, so it must keep
// the "v" prefix - see the comment atop config.yaml. Single-quoted to match this repo's
// prettier config (singleQuote: true, which `pnpm format` already enforces on this file).
const configPath = path.join(repoRoot, 'ha-addon/everylist/config.yaml')
const config = readFileSync(configPath, 'utf8')
const versionLine = /^version: .*/m
if (!versionLine.test(config)) {
  console.error(`Could not find a "version:" line in ${configPath}`)
  process.exit(1)
}
writeFileSync(configPath, config.replace(versionLine, `version: '${tag}'`))
console.log(`Updated ${path.relative(repoRoot, configPath)} -> ${tag}`)

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

console.log(`\nDone. Review the diff, then commit/PR/merge as usual.`)
