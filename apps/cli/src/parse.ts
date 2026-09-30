import { UsageError } from './errors.js'

/**
 * Parses a human price flag (`--price 12.99`) into the API's integer cents, rejecting anything
 * that isn't a non-negative number. Mirrors the web UI's `Math.round(Number(value) * 100)` so a
 * CLI-added item's price matches one added in the app down to the cent.
 */
export function parsePriceFlag(raw: string): number {
  const cleaned = raw.trim()
  // A leading currency symbol or stray characters are easy to paste in — strip everything that
  // isn't a digit, decimal point, or sign, as the web field does, so "12.99" and "$12.99" agree.
  const numeric = cleaned.replace(/[^0-9.-]/g, '')
  const value = Number(numeric)
  if (numeric === '' || !Number.isFinite(value) || value < 0) {
    throw new UsageError(`--price must be a non-negative number, got "${raw}".`)
  }
  return Math.round(value * 100)
}
