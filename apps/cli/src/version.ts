import { readFileSync } from 'node:fs'

/**
 * The CLI's version, read from its own `package.json` (so `pnpm prepare-release`'s version bump
 * is the single source of truth). Resolved relative to this module's own URL, which works both
 * from `src/` under Vitest and from `dist/` after a build.
 */
export function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: unknown
  }
  // `package.json` always carries a version; the fallback only satisfies the optional-chained
  // type, not a reachable state.
  /* v8 ignore next */
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
}
