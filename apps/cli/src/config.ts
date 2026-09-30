import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CliError } from './errors.js'

/**
 * The persisted CLI config: where the server is and which Personal Access Token to send. Both
 * optional — a caller can supply either via env vars instead (see `resolveBaseUrl`/`resolveToken`),
 * which is how CI and one-off scripts avoid writing a file at all.
 */
export interface CliConfig {
  baseUrl?: string
  token?: string
}

/** Env vars that override the config file, taking precedence so a script never has to mutate
 *  the user's saved config to target a different server/token. */
export const BASE_URL_ENV = 'EVERYLIST_URL'
export const TOKEN_ENV = 'EVERYLIST_TOKEN'

const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * The platform config directory for this app — `$XDG_CONFIG_HOME/everylist` (or
 * `~/.config/everylist`) on Linux, `~/Library/Application Support/everylist` on macOS, and
 * `%APPDATA%\everylist` on Windows. Honors `EVERYLIST_CONFIG_DIR` for tests and for anyone who
 * wants the file somewhere specific.
 */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.EVERYLIST_CONFIG_DIR
  if (override) return override
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir()
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'everylist')
    case 'win32':
      return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'everylist')
    default:
      return path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'everylist')
  }
}

/** The absolute path to `config.json` inside {@link configDir}. */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), 'config.json')
}

/**
 * Reads the config file, tolerating every failure mode: a missing file, malformed JSON, or a
 * value of the wrong type all collapse to "no value for that field" rather than throwing, the
 * same resilience the desktop shell's `readConfig` uses — a broken config file must never be
 * why the CLI can't even report what's wrong.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  let raw: string
  try {
    raw = fs.readFileSync(configPath(env), 'utf8')
  } catch {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }

  if (!parsed || typeof parsed !== 'object') return {}
  const record = parsed as Record<string, unknown>
  const config: CliConfig = {}
  if (typeof record.baseUrl === 'string' && record.baseUrl.length > 0) {
    config.baseUrl = record.baseUrl
  }
  if (typeof record.token === 'string' && record.token.length > 0) config.token = record.token
  return config
}

/**
 * Writes the config file with `0600` (owner-only) permissions, creating the directory `0700`
 * first. The token in this file is a real credential, so it's never world- or group-readable —
 * the same token-hygiene rule the plan calls out. The write is atomic-ish (write to a temp file,
 * then rename) so a crash mid-write can't leave a half-written, unparseable config behind.
 */
export function writeConfig(config: CliConfig, env: NodeJS.ProcessEnv = process.env): void {
  const dir = configDir(env)
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE })

  const target = configPath(env)
  const tmp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: FILE_MODE })
  // `writeFileSync`'s mode is masked by the process umask and ignored entirely when the file
  // already exists, so chmod explicitly to guarantee 0600 either way.
  fs.chmodSync(tmp, FILE_MODE)
  fs.renameSync(tmp, target)
}

/** The effective base URL: env override first, then the config file, normalized to no trailing
 *  slash so path-joins never double up. */
export function resolveBaseUrl(
  config: CliConfig = readConfig(),
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const value = env[BASE_URL_ENV] ?? config.baseUrl
  return value ? value.replace(/\/+$/, '') : undefined
}

/** The effective token: env override first, then the config file. */
export function resolveToken(
  config: CliConfig = readConfig(),
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return env[TOKEN_ENV] ?? config.token
}

/**
 * Masks a token for display (`elt_abcd…wxyz`): enough to recognize which token it is, never
 * enough to use. Anything short enough that masking would reveal most of it is fully hidden.
 */
export function maskToken(token: string): string {
  if (token.length <= 10) return '••••'
  return `${token.slice(0, 7)}…${token.slice(-4)}`
}

/** Throws an `AuthError`-shaped message when a required base URL is missing — shared by every
 *  command that needs one, so the "log in first" guidance exists once. */
export function requireBaseUrl(
  config: CliConfig = readConfig(),
  env: NodeJS.ProcessEnv = process.env
): string {
  const baseUrl = resolveBaseUrl(config, env)
  if (!baseUrl) {
    throw new CliError(
      `No server URL configured. Run \`everylist login --url <server>\`, or set ${BASE_URL_ENV}.`,
      3
    )
  }
  return baseUrl
}
