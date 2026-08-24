import logger from '@adonisjs/core/services/logger'

export interface ParsedImportItem {
  name: string
  notes: string[]
  price: number | null
}

export interface ParsedImportSection {
  /** Raw ALL-CAPS header text, or null for items pasted without a category header. */
  header: string | null
  items: ParsedImportItem[]
}

export interface ParsedBulkImport {
  sections: ParsedImportSection[]
}

/**
 * Line-start bullet markers accepted in a structured (AnyList-style) paste —
 * the marker must be followed by whitespace or end-of-line so a name like
 * "-50%" isn't mistaken for a bulleted item.
 */
const BULLET_PREFIX = /^[•·*\-–—›](?:\s|$)/

/**
 * A category header is an all-caps line: only uppercase letters, digits, and
 * the punctuation AnyList category names use (e.g. "BREAKFAST & CEREAL").
 */
const HEADER_PATTERN = /^[A-Z0-9&'’.,/()%#\- ]{2,}$/

/** A bare line that is a link — always a note of the item above it, never a name of its own. */
const URL_PATTERN = /^https?:\/\//i

/** One "$1,234.56?" / "$1,234.56/ea" style price mention. */
const PRICE_TOKEN = String.raw`\$[\d,]+(?:\.\d{2})?\??(?:\/[a-zA-Z]+)?`
/** A bare line consisting only of one or more price mentions (e.g. "$3,060? $3,366?"). */
const PRICE_LINE_PATTERN = new RegExp(`^${PRICE_TOKEN}(?:\\s+${PRICE_TOKEN})*$`)
/** A bare line that is exactly one unhedged price — safe to lift into the item's price field. */
const SINGLE_PRICE_PATTERN = /^\$([\d,]+(?:\.\d{2})?)(?:\/[a-zA-Z]+)?$/
/** A "[$1,588]" price tag trailing an item name, e.g. "Wildfire Offset [$1,588]". */
const TRAILING_BRACKET_PRICE = /\s*\[\$\s?([\d,]+(?:\.\d{1,2})?)\]\s*$/

function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line)
}

function isCategoryHeader(line: string): boolean {
  return HEADER_PATTERN.test(line) && /[A-Z]/.test(line)
}

function isUrlLine(line: string): boolean {
  return URL_PATTERN.test(line)
}

function isPriceOnlyLine(line: string): boolean {
  return PRICE_LINE_PATTERN.test(line)
}

function stripBullet(line: string): string {
  return line.replace(/^[•·*\-–—›]\s*/, '')
}

/** Trims whitespace and strips superfluous characters (control chars, runs of whitespace). */
/* eslint-disable-next-line no-control-regex */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

function cleanItemName(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
}

function parsePriceCents(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/**
 * Pulls a trailing "[$1,588]" price tag off an item name, if present, so it lands in the item's
 * own price field instead of sitting as noise in the name.
 */
function extractTrailingPrice(name: string): { name: string; price: number | null } {
  const match = TRAILING_BRACKET_PRICE.exec(name)
  if (!match) return { name, price: null }
  const stripped = name.slice(0, match.index).trim()
  if (stripped.length === 0) return { name, price: null }
  return { name: stripped, price: parsePriceCents(match[1]!) }
}

/**
 * Parses pasted list text into sections of items.
 *
 * Two formats are supported:
 * - Plain: one item per line, blank lines ignored. Each line becomes an item.
 * - Structured (AnyList export): a list title on the first line, then
 *   ALL-CAPS category headers with bulleted items underneath, sections
 *   separated by blank lines. A bare line straight under a bulleted item is
 *   that item's note.
 *
 * Some sources (e.g. a personal wishlist pasted from a notes app) put a
 * product's extra links or price mentions on their own paragraph, separated
 * from the item by a blank line. Since a bare line is normally read as a new
 * item once a blank line has intervened, a link or price-only line would
 * otherwise be split off into a bogus item named after the URL. Those two
 * shapes are special-cased to always continue as notes on the prior item,
 * blank line or not — see `isUrlLine`/`isPriceOnlyLine` below.
 */
export function parseBulkImport(text: string): ParsedBulkImport {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const hasBullets = lines.some(isBulletLine)

  if (!hasBullets) {
    const items: ParsedImportItem[] = lines
      .filter((line) => line.length > 0)
      .map((line) => cleanItemName(line))
      .filter((name) => name.length > 0)
      .map((name) => ({ name, notes: [], price: null }))
    logger.debug({ format: 'plain', itemCount: items.length }, 'parsed bulk import')
    return { sections: [{ header: null, items }] }
  }

  // An AnyList export opens with the list's own title (e.g. "Shopping List")
  // on its own line before the first category header — skip it, but only when
  // it sits right before a blank line so a bare line that is actually an item
  // isn't dropped.
  const firstIndex = lines.findIndex((line) => line !== '')
  const isTitle =
    !isBulletLine(lines[firstIndex]!) &&
    !isCategoryHeader(lines[firstIndex]!) &&
    lines[firstIndex + 1] === ''
  const body = lines.slice(isTitle ? firstIndex + 2 : firstIndex)

  const sections: ParsedImportSection[] = []
  let section: ParsedImportSection | null = null
  let item: ParsedImportItem | null = null
  // Whether a blank line has been seen since `item` was last set — a plain bare line after one
  // reads as a new item, but a link or price-only line still continues the prior item's notes.
  let blankSinceItem = false

  for (const line of body) {
    if (line.length === 0) {
      blankSinceItem = true
      continue
    }
    if (isBulletLine(line)) {
      const name = cleanItemName(stripBullet(line))
      if (name.length === 0) {
        item = null
        blankSinceItem = false
        continue
      }
      if (!section) {
        section = { header: null, items: [] }
        sections.push(section)
      }
      item = { ...extractTrailingPrice(name), notes: [] }
      section.items.push(item)
      blankSinceItem = false
      continue
    }
    if (isCategoryHeader(line)) {
      section = { header: line, items: [] }
      sections.push(section)
      item = null
      blankSinceItem = false
      continue
    }
    // A bare line straight under an item — or a link/price mention that continues that item's
    // notes even across a blank paragraph break — is AnyList's item note...
    if (item && (!blankSinceItem || isUrlLine(line) || isPriceOnlyLine(line))) {
      const singlePrice = item.price === null ? SINGLE_PRICE_PATTERN.exec(line) : null
      if (singlePrice) {
        item.price = parsePriceCents(singlePrice[1]!)
      } else {
        const note = cleanItemName(line)
        if (note.length > 0) item.notes.push(note)
      }
      blankSinceItem = false
      continue
    }
    // ...otherwise keep an out-of-format bare line as an item rather than
    // silently dropping data.
    const name = cleanItemName(line)
    if (name.length === 0) continue
    if (!section) {
      section = { header: null, items: [] }
      sections.push(section)
    }
    item = { ...extractTrailingPrice(name), notes: [] }
    section.items.push(item)
    blankSinceItem = false
  }

  const result = { sections: sections.filter((entry) => entry.items.length > 0) }
  logger.debug(
    {
      format: 'structured',
      sectionCount: result.sections.length,
      itemCount: result.sections.reduce((total, entry) => total + entry.items.length, 0),
    },
    'parsed bulk import'
  )
  return result
}
