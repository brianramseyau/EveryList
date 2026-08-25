const BYTES_PER_MB = 1024 * 1024

/** Rounds a byte count from `process.memoryUsage()` to one decimal place of MB, for a debug
 * page — full byte precision isn't meaningful for a human skimming memory usage. */
export function toMb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MB) * 10) / 10
}

/** Reports only whether a secret-valued env var is configured, not its value — used for the
 * handful of optional env vars (SMTP/Authentik) that aren't `Env.schema.secret()`-typed and so
 * wouldn't otherwise be redacted before reaching the debug page's JSON response. */
export function presence(value: string | undefined): 'set' | 'not set' {
  return value ? 'set' : 'not set'
}
