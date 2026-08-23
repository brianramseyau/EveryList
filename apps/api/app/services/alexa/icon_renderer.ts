import * as mdi from '@mdi/js'
import { Resvg } from '@resvg/resvg-js'

/**
 * Same fallback glyph `apps/web/src/lib/components/Icon.svelte` draws for an icon name that
 * doesn't resolve (e.g. the seeded "Pantry" category's `foodCanArrowUp`, which isn't a real
 * `@mdi/js` export in the installed version) — a question mark in a circle, so an Alexa screen
 * device shows the same "something's off but not broken" glyph the app itself already shows.
 */
const FALLBACK_PATH =
  'M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,17V15H13V17H11M11,7H13A2,2 0 0,1 15,9V10.5C15,11.11 14.61,11.65 14.05,11.87L13,12.31V13H11V11.5L12.7,10.83C12.89,10.76 13,10.58 13,10.38V9.5C13,9.22 12.78,9 12.5,9H11.5C11.22,9 11,9.22 11,9.5V10H9V9A2,2 0 0,1 11,7Z'

const SIZE = 64

const cache = new Map<string, Buffer>()

/** "fruitCherries" -> the `mdiFruitCherries` export, matching `apps/web`'s `mdi.ts` convention. */
function toMdiExportName(iconName: string): string {
  return `mdi${iconName.charAt(0).toUpperCase()}${iconName.slice(1)}`
}

/**
 * Rasterizes an `@mdi/js` category/list icon to a PNG for the Alexa APL display
 * (PHASE16_PLAN.md Stage 3) — APL's `Image` component can only fetch a real image over HTTPS,
 * it can't render arbitrary SVG icon libraries or vector icon fonts directly. Renders in the
 * requested `colorHex` rather than always the same color, since the app tints category headers
 * with each list's own `color`. Cached in-process by `${iconName}:${colorHex}` — the same list's
 * icons repeat across every request/display refresh, and the full icon set in use at once is
 * small enough that an unbounded cache is fine.
 */
export function renderIcon(iconName: string, colorHex: string): Buffer {
  const cacheKey = `${iconName}:${colorHex}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const icons = mdi as unknown as Record<string, string | undefined>
  const path = icons[toMdiExportName(iconName)] ?? FALLBACK_PATH
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}"><path d="${path}" fill="#${colorHex}"/></svg>`
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng()

  cache.set(cacheKey, png)
  return png
}
