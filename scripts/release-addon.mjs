#!/usr/bin/env node
/**
 * Points the Home Assistant add-on at a published release: sets `version` in
 * ha-addon/everylist/config.yaml. Run it LAST, after the release tag is pushed and
 * docker-publish.yml has finished publishing the image.
 *
 * That `version` is not a display string - Supervisor pulls exactly
 * `ghcr.io/brianramseyau/everylist:<version>`, so it must never land on `main` ahead of the image
 * existing. This is why it is separate from scripts/prepare-release.mjs (which runs *before*
 * tagging). Committed through the normal branch/PR flow: main's required checks only run on
 * pull_request events, so a direct push (or a bot-authored PR, whose events GitHub suppresses)
 * doesn't work - see docker-publish.yml's comment.
 *
 * Usage (on a branch, not main, after the tag's docker-publish.yml run is green):
 *   node scripts/release-addon.mjs v1.6.2
 * Then add a "v1.6.2" entry to ha-addon/everylist/CHANGELOG.md (prose, not scripted), review the
 * diff, and commit/PR/merge as usual.
 *
 * Refuses to run unless the tag exists on origin (a cheap guard against bumping ahead of a
 * release; it cannot confirm the image finished publishing - check the docker-publish.yml run),
 * and refuses to move the add-on to an older version unless `--allow-downgrade` is passed.
 * Stable releases only (no "-rc"/"-beta" suffix).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const allowDowngrade = process.argv.includes('--allow-downgrade')
const tag = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    'Usage: node scripts/release-addon.mjs vX.Y.Z [--allow-downgrade] (stable releases only, no -rc/-beta suffix)'
  )
  process.exit(1)
}

// `--exit-code` makes ls-remote exit 2 for "no matching ref"; anything else (git missing, no
// `origin`, network/auth failure) is a different problem and must not read as "push the tag".
const lsRemote = spawnSync(
  'git',
  ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`],
  {
    cwd: repoRoot,
    encoding: 'utf8'
  }
)
if (lsRemote.status === 2) {
  console.error(
    `Tag ${tag} is not on origin. Push it and let docker-publish.yml finish before bumping the add-on.`
  )
  process.exit(1)
}
if (lsRemote.status !== 0) {
  console.error(
    `Could not check origin for ${tag}: ${lsRemote.error?.message ?? lsRemote.stderr.trim() ?? `git exited ${lsRemote.status}`}`
  )
  process.exit(1)
}

// Supervisor pulls this value verbatim as the Docker image tag to install, so it keeps the "v"
// prefix. Single-quoted to match this repo's prettier config (singleQuote: true).
const configPath = path.join(repoRoot, 'ha-addon/everylist/config.yaml')
const config = readFileSync(configPath, 'utf8')
const versionLine = /^version: .*/m
if (!versionLine.test(config)) {
  console.error(`Could not find a "version:" line in ${configPath}`)
  process.exit(1)
}

// Refuse to move the add-on backwards: Supervisor would roll users onto an older image, and the
// resulting one-line diff looks innocuous in review. `--allow-downgrade` is the deliberate
// rollback opt-in.
const semver = (value) => value.replace(/^v/, '').split('.').map(Number)
const current = /^version: ['"]?(v\d+\.\d+\.\d+)/m.exec(config)?.[1]
if (current && !allowDowngrade) {
  const [next, prev] = [semver(tag), semver(current)]
  const older = next.findIndex((part, i) => part !== prev[i])
  if (older !== -1 && next[older] < prev[older]) {
    console.error(
      `${tag} is older than the add-on's current ${current}. Pass --allow-downgrade if this rollback is intentional.`
    )
    process.exit(1)
  }
}
writeFileSync(configPath, config.replace(versionLine, `version: '${tag}'`))
console.log(`Updated ${path.relative(repoRoot, configPath)} -> ${tag}`)

console.log(
  `\nDone. Also add a "${tag}" entry to ha-addon/everylist/CHANGELOG.md (not scripted - it's prose).\nThen review the diff, commit/PR/merge as usual.`
)
