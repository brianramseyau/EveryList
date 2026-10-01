import { UsageError } from './errors.js'

/** A parsed flag value: present-but-valueless flags are `true`. */
export type FlagValue = string | boolean

export interface ParsedArgs {
  /** The first non-flag token (`add`, `lists`, …), or undefined when none was given. */
  command?: string
  /** The remaining non-flag tokens (list/item names, ids, …). */
  positionals: string[]
  /** Long-form flag names → values, e.g. `{ json: true, quantity: '2' }`. */
  flags: Record<string, FlagValue>
}

/** Short aliases resolved to their canonical long flag name. Unknown short flags stay as-is. */
const SHORT_ALIASES: Record<string, string> = {
  h: 'help',
  V: 'version',
  q: 'quantity',
  n: 'notes',
  p: 'price',
  c: 'category',
  s: 'store',
  d: 'deadline'
}

/**
 * Flags that are booleans, never taking a value. Without this, `--json lists` would swallow the
 * command name as `--json`'s value (there's no way to tell a flag from a value otherwise). These
 * are the only flags the CLI defines as switches.
 */
const BOOLEAN_FLAGS = new Set(['json', 'all', 'help', 'version'])

/**
 * Parses `process.argv.slice(2)`-style tokens: the first non-flag token is the command, the rest
 * are positionals, and `--name value`, `--name=value` and `-x value` all populate flags. A
 * `--` terminator forces every following token to be positional (so an item name can start with
 * a dash). No command-specific knowledge lives here — commands read the flags they expect and
 * reject the rest via {@link rejectUnknownFlags}.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, FlagValue> = {}
  let command: string | undefined
  let onlyPositionals = false

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (onlyPositionals) {
      positionals.push(token)
      continue
    }
    if (token === '--') {
      onlyPositionals = true
      continue
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1)
      } else {
        const name = token.slice(2)
        const next = argv[i + 1]
        if (!BOOLEAN_FLAGS.has(name) && next !== undefined && !next.startsWith('-')) {
          flags[name] = next
          i++
        } else {
          flags[name] = true
        }
      }
      continue
    }

    if (token.startsWith('-') && token.length > 1) {
      const name = token.slice(1)
      const canonical = SHORT_ALIASES[name] ?? name
      const next = argv[i + 1]
      // `-h`/`-V` are booleans like their long forms — never consume a following token (so
      // `-h lists` shows help rather than treating "lists" as `--help`'s value).
      if (!BOOLEAN_FLAGS.has(canonical) && next !== undefined && !next.startsWith('-')) {
        flags[canonical] = next
        i++
      } else {
        flags[canonical] = true
      }
      continue
    }

    if (command === undefined) command = token
    else positionals.push(token)
  }

  return { command, positionals, flags }
}

/** Throws a `UsageError` naming any flag the command doesn't accept, so a typo like `--quanity`
 *  fails loudly instead of being silently ignored. The always-valid global flags are exempt. */
export function rejectUnknownFlags(flags: Record<string, FlagValue>, allowed: string[] = []): void {
  const permitted = new Set(['json', 'url', 'token', 'help', 'version', ...allowed])
  const unknown = Object.keys(flags).filter((name) => !permitted.has(name))
  if (unknown.length > 0) {
    throw new UsageError(
      `Unknown option${unknown.length > 1 ? 's' : ''}: ${unknown.map((f) => `--${f}`).join(', ')}`
    )
  }
}

/**
 * Reads a flag's value. A flag that needs a value but was passed without one (`--quantity`, or
 * `--quantity --json`) is a usage error, not a silent "absent" — otherwise the value is dropped
 * with no feedback. Boolean flags (`--json`, `--all`) are read with {@link boolFlag} instead.
 */
export function stringFlag(flags: Record<string, FlagValue>, name: string): string | undefined {
  const value = flags[name]
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  throw new UsageError(`Option --${name} requires a value.`)
}

/** True when a boolean flag was passed (`--json`, `-h`, …). */
export function boolFlag(flags: Record<string, FlagValue>, name: string): boolean {
  return flags[name] === true
}
