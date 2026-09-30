import { UsageError } from './errors.js'

/**
 * Parses a human price flag (`--price 12.99`) into the API's integer cents. A leading currency
 * symbol, whitespace, and thousands separators are tolerated (so a pasted `"$1,234.56"` works),
 * but the remaining value must be a plain non-negative decimal — `"1e3"`, `"2x3.50"`, or
 * `"abc12"` are rejected rather than silently mangled into a different amount. The result mirrors
 * the web UI's `Math.round(value * 100)` so a CLI-added item's price matches one added in the app.
 */
export function parsePriceFlag(raw: string): number {
  // Strip the cosmetic characters a paste may carry; anything else non-numeric makes the strict
  // match below fail, which is the point.
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new UsageError(`--price must be a non-negative number, got "${raw}".`)
  }
  const value = Number(cleaned)
  const cents = Math.round(value * 100)
  // A huge digit string can still parse finite but overflow once multiplied into cents
  // (e.g. 308 nines → finite value, Infinity cents) — reject either.
  if (!Number.isFinite(value) || !Number.isFinite(cents)) {
    throw new UsageError(`--price is out of range, got "${raw}".`)
  }
  return cents
}
