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
 * Refuses to run unless the tag exists on origin - a cheap guard against bumping ahead of a
 * release. It cannot confirm the image finished publishing; check the docker-publish.yml run.
 * Stable releases only (no "-rc"/"-beta" suffix).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    'Usage: node scripts/release-addon.mjs vX.Y.Z (stable releases only, no -rc/-beta suffix)'
  )
  process.exit(1)
}

try {
  execFileSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], {
    cwd: repoRoot,
    stdio: 'ignore'
  })
} catch {
  console.error(
    `Tag ${tag} is not on origin. Push it and let docker-publish.yml finish before bumping the add-on.`
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
writeFileSync(configPath, config.replace(versionLine, `version: '${tag}'`))
console.log(`Updated ${path.relative(repoRoot, configPath)} -> ${tag}`)

console.log(
  `\nDone. Also add a "${tag}" entry to ha-addon/everylist/CHANGELOG.md (not scripted - it's prose).\nThen review the diff, commit/PR/merge as usual.`
)
