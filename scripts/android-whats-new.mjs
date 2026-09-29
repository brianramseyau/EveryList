#!/usr/bin/env node
/**
 * Extracts the newest entry's "What's new" block from apps/android/CHANGELOG.md and writes it as
 * the Google Play release-notes file consumed by native-build.yml's publish-play job.
 *
 * Why this exists: Play's release notes are separate from the GitHub Release notes and are capped
 * at ~500 characters per locale, so the long hand-written release notes can't be pasted in. The
 * changelog's newest entry carries a deliberately truncated plain-text summary for exactly this,
 * and this script is the single place that validates and emits it — a release is refused rather
 * than published with stale, empty, oversized, or Markdown-laden notes.
 *
 * Output: apps/android/whatsnew/whatsnew-en-AU (the app ships English-only today, so a single
 * en-AU file covers every Play locale that falls back to it). r0adkll/upload-google-play reads
 * any `whatsnew-<LOCALE>` file in the given directory and passes `<LOCALE>` straight through to
 * the Play API, so the filename's suffix is the Play locale verbatim.
 *
 * Usage: node scripts/android-whats-new.mjs <tag> [--changelog <path>] [--out-dir <dir>]
 *   <tag> is the release version, with or without a leading "v" (e.g. v1.7.5 or 1.7.5).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..')

/** Play's own limit is 500 characters; keep the same bound so this fails at author time. */
export const MAX_LENGTH = 500

/** en-AU — see the module doc comment. */
export const LOCALE = 'en-AU'

const START = '<!-- whats-new:start -->'
const END = '<!-- whats-new:end -->'

// Markers only count when alone on their own line — the changelog's header prose mentions them
// inline (in backticks), and those mentions must not be mistaken for a real block.
const START_LINE = /^[ \t]*<!-- whats-new:start -->[ \t]*$/m
const END_LINE = /^[ \t]*<!-- whats-new:end -->[ \t]*$/m

/**
 * Removes fenced code blocks (``` ... ```) so the changelog's own template block — which contains
 * what's-new markers as a reference — is never mistaken for a real entry.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripFencedCodeBlocks(markdown) {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
}

/**
 * @typedef {{ version: string, text: string }} WhatsNew
 */

/**
 * Pulls the newest entry's version + What's new text out of the changelog.
 *
 * @param {string} markdown
 * @returns {WhatsNew}
 */
export function extractWhatsNew(markdown) {
  const source = stripFencedCodeBlocks(markdown)

  const startMatch = START_LINE.exec(source)
  if (!startMatch) {
    throw new Error(
      `No "${START}" block found in the changelog. Add an entry for this release first.`
    )
  }
  const startIndex = startMatch.index
  const afterStart = startIndex + startMatch[0].length

  const endMatch = END_LINE.exec(source.slice(afterStart))
  if (!endMatch) {
    throw new Error(`Found "${START}" with no matching "${END}" on its own line.`)
  }
  const endIndex = afterStart + endMatch.index

  // The heading immediately above the block identifies which release it belongs to. Search only
  // the text before the block so a later entry's heading can't be matched by mistake.
  const before = source.slice(0, startIndex)
  const headings = [...before.matchAll(/^##[ \t]+v?(\d+\.\d+\.\d+)\b.*$/gm)]
  if (headings.length === 0) {
    throw new Error(`No "## vX.Y.Z" heading found above the "${START}" block.`)
  }
  const version = headings[headings.length - 1][1]

  const text = source.slice(afterStart, endIndex).trim().replace(/\s+/g, ' ')

  return { version, text }
}

/**
 * Rejects anything Play can't render cleanly as plain text, or that's too long.
 *
 * @param {string} text
 */
export function validateWhatsNew(text) {
  if (text.length === 0) {
    throw new Error("The What's new block is empty.")
  }
  if (text.length > MAX_LENGTH) {
    throw new Error(
      `The What's new block is ${text.length} characters; Play's limit is ${MAX_LENGTH}. Trim it.`
    )
  }
  if (/\*\*|__/.test(text) || /`/.test(text) || /\[[^\]]*\]\([^)]*\)/.test(text)) {
    throw new Error(
      "The What's new block contains Markdown (bold, code, or a link). Play renders plain text only."
    )
  }
  if (/^\s*(?:[#>*+-]|\d+\.)\s/m.test(text)) {
    throw new Error(
      "The What's new block contains a Markdown list/heading/quote marker. Play renders plain text only."
    )
  }
}

/**
 * @param {{ tag: string, changelogPath: string, outDir: string }} options
 * @returns {{ version: string, text: string, outFile: string }}
 */
export function buildWhatsNew(options) {
  const tag = String(options.tag).replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(
      `Expected a vX.Y.Z release tag, got "${options.tag}". (Pre-releases don't publish to Play.)`
    )
  }

  const { version, text } = extractWhatsNew(readFileSync(options.changelogPath, 'utf8'))
  if (version !== tag) {
    throw new Error(
      `The newest changelog entry is v${version}, but this release is v${tag}. Add a v${tag} entry at the top.`
    )
  }
  validateWhatsNew(text)

  mkdirSync(options.outDir, { recursive: true })
  const outFile = path.join(options.outDir, `whatsnew-${LOCALE}`)
  writeFileSync(outFile, text)
  return { version, text, outFile }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  const tag = args.find((arg) => !arg.startsWith('--'))
  const option = (name, fallback) => {
    const index = args.indexOf(name)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }

  if (!tag) {
    console.error(
      'Usage: node scripts/android-whats-new.mjs <tag> [--changelog <path>] [--out-dir <dir>]'
    )
    process.exit(1)
  }

  try {
    const result = buildWhatsNew({
      tag,
      changelogPath:
        option('--changelog', null) ?? path.join(repoRoot, 'apps/android/CHANGELOG.md'),
      outDir: option('--out-dir', null) ?? path.join(repoRoot, 'apps/android/whatsnew')
    })
    console.log(`Wrote ${result.outFile} for v${result.version} (${result.text.length} chars)`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
