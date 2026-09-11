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
 *   node scripts/prepare-release.mjs v1.5.0
 *
 * Run this on a release branch (not main), review the diff, then commit, push,
 * open a PR, and merge it like any other change. Once merged, tag *that*
 * commit on main and push the tag - that's what actually triggers
 * docker-publish.yml's build/publish:
 *   git checkout main && git pull
 *   git tag v1.5.0 && git push origin v1.5.0
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag)) {
  console.error('Usage: node scripts/prepare-release.mjs vX.Y.Z[-prerelease]')
  process.exit(1)
}
const bareVersion = tag.slice(1)

// Supervisor pulls this value verbatim as the Docker image tag to install, so it must keep
// the "v" prefix - see the comment atop config.yaml.
const configPath = path.join(repoRoot, 'ha-addon/everylist/config.yaml')
const config = readFileSync(configPath, 'utf8')
const versionLine = /^version: .*/m
if (!versionLine.test(config)) {
  console.error(`Could not find a "version:" line in ${configPath}`)
  process.exit(1)
}
writeFileSync(configPath, config.replace(versionLine, `version: "${tag}"`))
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

console.log(
  `\nDone. Review the diff, then commit/PR/merge as usual, and once merged, tag that commit on main with ${tag}.`
)
