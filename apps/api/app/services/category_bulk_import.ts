/**
 * Matches a category name — an AnyList-style bulk-import section header, or a bare name from a
 * pasted category list — to a relatable @mdi/js icon; anything unrecognized falls back to the
 * generic 'tag'. Shared by ItemsController#import (AnyList section headers become categories) and
 * CategoriesController#bulkImport (a pasted list of category names).
 */
export const CATEGORY_ICON_KEYWORDS: Record<string, string> = {
  'produce': 'fruitCherries',
  'fruit & veg': 'fruitCherries',
  'meat': 'foodDrumstick',
  'seafood': 'fish',
  'fish': 'fish',
  'bakery': 'breadSlice',
  'dairy': 'cheese',
  'cheese': 'cheese',
  'frozen': 'snowflake',
  'beverages': 'bottleSoda',
  'drinks': 'bottleSoda',
  'snacks': 'cookie',
  'breakfast': 'egg',
  'breakfast & cereal': 'egg',
  'cooking': 'potSteam',
  'pantry': 'foodCanArrowUp',
  'household': 'spray',
  'chemist': 'pill',
  'chemists': 'pill',
  'pharmacy': 'pill',
  'medication': 'pill',
  'toiletries': 'shower',
  'pet': 'paw',
  'pets': 'paw',
  'pet supplies': 'paw',
  'specials': 'sale',
}

export function matchCategoryIcon(name: string): string {
  return CATEGORY_ICON_KEYWORDS[name.trim().toLowerCase()] ?? 'tag'
}

/** "BREAKFAST & CEREAL" -> "Breakfast & Cereal", matching EveryList's title-cased category names. */
export function titleCaseCategoryName(input: string): string {
  return input
    .toLowerCase()
    .replace(
      /(^|[\s&/\\-])([a-z])/g,
      (_match, separator: string, letter: string) => separator + letter.toUpperCase()
    )
}

function isAllCaps(name: string): boolean {
  return /[A-Z]/.test(name) && !/[a-z]/.test(name)
}

/** A name typed/pasted in all caps (e.g. an AnyList header, or "SNACKS") is title-cased to match
 * EveryList's convention; anything already mixed-case is left exactly as the user typed it. */
export function normalizeCategoryName(raw: string): string {
  const trimmed = raw.trim()
  return isAllCaps(trimmed) ? titleCaseCategoryName(trimmed) : trimmed
}

const BULLET_PREFIX = /^[•·*\-–—›](?:\s|$)/
/* eslint-disable-next-line no-control-regex */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

function cleanName(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
}

/** Splits pasted text into category names, one per line — an optional leading bullet marker
 * (matching bulk item import's structured-paste bullets) is stripped, blank lines are ignored. */
export function parseCategoryNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      return cleanName(BULLET_PREFIX.test(trimmed) ? trimmed.replace(BULLET_PREFIX, '') : trimmed)
    })
    .filter((name) => name.length > 0)
}
