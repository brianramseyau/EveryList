import logger from '@adonisjs/core/services/logger'

export interface ParsedImportItem {
  name: string
  notes: string[]
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

function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line)
}

function isCategoryHeader(line: string): boolean {
  return HEADER_PATTERN.test(line) && /[A-Z]/.test(line)
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

/**
 * Parses pasted list text into sections of items.
 *
 * Two formats are supported:
 * - Plain: one item per line, blank lines ignored. Each line becomes an item.
 * - Structured (AnyList export): a list title on the first line, then
 *   ALL-CAPS category headers with bulleted items underneath, sections
 *   separated by blank lines. A bare line straight under a bulleted item is
 *   that item's note.
 */
export function parseBulkImport(text: string): ParsedBulkImport {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const hasBullets = lines.some(isBulletLine)

  if (!hasBullets) {
    const items: ParsedImportItem[] = lines
      .filter((line) => line.length > 0)
      .map((line) => cleanItemName(line))
      .filter((name) => name.length > 0)
      .map((name) => ({ name, notes: [] }))
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

  for (const line of body) {
    if (line.length === 0) {
      item = null
      continue
    }
    if (isBulletLine(line)) {
      const name = cleanItemName(stripBullet(line))
      if (name.length === 0) {
        item = null
        continue
      }
      if (!section) {
        section = { header: null, items: [] }
        sections.push(section)
      }
      item = { name, notes: [] }
      section.items.push(item)
      continue
    }
    if (isCategoryHeader(line)) {
      section = { header: line, items: [] }
      sections.push(section)
      item = null
      continue
    }
    // A bare line straight under an item is AnyList's item note...
    if (item) {
      const note = cleanItemName(line)
      if (note.length > 0) item.notes.push(note)
      continue
    }
    // ...otherwise keep an out-of-format bare line as an item rather than
    // silently dropping data.
    if (!section) {
      section = { header: null, items: [] }
      sections.push(section)
    }
    const name = cleanItemName(line)
    if (name.length === 0) continue
    item = { name, notes: [] }
    section.items.push(item)
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
